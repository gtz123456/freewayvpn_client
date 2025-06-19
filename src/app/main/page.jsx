'use client'
// pages/index.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { useRef } from 'react';

import AutoDismissMessageQueue from '@/components/AutoDismissMessageQueue';
import ToggleSwitch from "@/components/ToggleSwitch";
import Tooltip from "@/components/Tooltip";

let pid;

const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds
const MAX_HEARTBEAT_FAILS = 3;

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [servers, setServers] = useState([]);
  const [selectedServerIndex, setSelectedServerIndex] = useState(0);
  const [ipv6Enabled, setIpv6Enabled] = useState(false); // If the host support ipv6

  const messageRef = useRef();

  const heartbeatIntervalRef = useRef(null);
  const heartbeatFailsRef = useRef(0);

  const router = useRouter();
  const server = 'http://146.235.210.34:8001';


  const [ipv6checked, setIpv6Checked] = useState(false);
  const [ipv6disabled, setIpv6Disabled] = useState(true);

  useEffect(() => {
    if (ipv6Enabled && servers && servers[selectedServerIndex] && servers[selectedServerIndex].ipv6) {
      setIpv6Disabled(false);
    }
    else {
      setIpv6Disabled(true);
      setIpv6Checked(false);
    }
  }, [servers, selectedServerIndex]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    getServers().then(async (data) => {
      setServers(data.servers);
      console.log('Fetched servers:', data.servers);

      data.servers.forEach(async (s) => {
        try {
          const latency = await invoke('ping', { address: s.ip });
          console.log(`Ping to ${s.ip}: ${latency} ms`);
          setServers((prev) =>
            prev.map((item) =>
              item.ip === s.ip ? { ...item, ping: latency } : item
            )
          );
        } catch (error) {
          setServers((prev) =>
            prev.map((item) =>
              item.ip === s.ip ? { ...item, ping: null } : item
            )
          );
        }
      });
    });


    invoke('check_ipv6').then((enabled) => {
      setIpv6Enabled(enabled);
    })
  }, []);

  useEffect(() => {
    if (connected) {
      heartbeatFailsRef.current = 0;
      heartbeatIntervalRef.current = setInterval(async () => {
        try {
          console.log("Sending heartbeat...");
          await sendHeartbeat();
          // On successful heartbeat, reset the failure counter
          heartbeatFailsRef.current = 0;
          console.log("Heartbeat success.");
        } catch (error) {
          // On failed heartbeat, increment the counter
          heartbeatFailsRef.current++;
          console.error(`Heartbeat failed (${heartbeatFailsRef.current}/${MAX_HEARTBEAT_FAILS}):`, error);

          // If the failure count reaches the maximum limit, disconnect
          if (heartbeatFailsRef.current >= MAX_HEARTBEAT_FAILS) {
            messageRef.current?.addMessage('Connection lost. Auto-disconnecting.', 'error');
            invoke('close_xray', { pid: pid });
            setConnected(false);
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
            console.log("Heartbeat stopped due to consecutive failures.");
          }
        }
      }, HEARTBEAT_INTERVAL_MS);
    }

    // Cleanup function: this runs when the component unmounts or `connected` changes to false
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
        console.log("Heartbeat stopped.");
      }
    };
  }, [connected]);

  async function connectToNode() {
    const token = localStorage.getItem('token');
    const response = await fetch(server + '/connect?serviceid=' + servers[selectedServerIndex].serviceid, {
      method: 'POST',
      headers: { 'Authorization': token },
    });
    if (!response.ok) {
      throw new Error('Failed to connect to node');
    }
    return await response.json();
  }

  async function getServers() {
    const token = localStorage.getItem('token');
    const response = await fetch(server + '/servers', {
      method: 'GET',
      headers: { 'Authorization': token },
    });
    return await response.json();
  }

  async function sendHeartbeat() { // TODO: disconnect if heartbeat can't be sent
    let serviceID = servers[selectedServerIndex].serviceid;
    if (!server) {
      return Promise.reject(new Error('No server selected'));
    }

    const token = localStorage.getItem('token');
    const response = await fetch(server + '/heartbeat?serviceid=' + serviceID, {
      method: 'POST',
      headers: { 'Authorization': token },
    });
    if (!response.ok) {
      throw new Error('Failed to send heartbeat');
    }
    return await response.json();
  }

  const handleClick = async () => {
    const selectedServer = servers[selectedServerIndex];

    if (!selectedServer) {
      messageRef.current?.addMessage('No server selected', 'error');
      return;
    }

    if (!connected) {
      // console.log('Connecting to server:', selectedServer.ip);

      try {
        const data = await connectToNode();
        
        await invoke('launch_xray', {
          uuid: data.uuid,
          pubkey: data.pubkey,
          server: ipv6checked && selectedServer.ipv6 ? selectedServer.ipv6 : selectedServer.ip,
          port: data.port, // "443"
        }).then((xraypid) => {
          pid = xraypid;
        });

        messageRef.current?.addMessage(`Connected to ${selectedServer.description || selectedServer.ip}`, 'success');
      } catch (error) {
        // console.error('Error connecting to node:', error);
        messageRef.current?.addMessage(`Error connecting to ${selectedServer.description || selectedServer.ip}: ${error.message}`, 'error');
        return;
      }
    } else {
      invoke('close_xray', { pid: pid });
    }

    setConnected(!connected);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 gap-4 relative">
      <select
        className="p-2 border rounded bg-white shadow"
        value={selectedServerIndex}
        onChange={(e) => setSelectedServerIndex(Number(e.target.value))}
        disabled={connected}
      >
        {servers.map((s, index) => (
          <option key={index} value={index}>
            {s.description ? s.description : s.ip } {s.ping !== null && s.ping !== undefined ? `- ${s.ping} ms` : ''}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-4">
        <p className="text-lg">IPv6:</p>
        <ToggleSwitch
          checked={ipv6checked}
          onChange={setIpv6Checked}
          onColor="bg-blue-500"
          offColor="bg-gray-400"
          disabled={ipv6disabled}
        />
      </div>

      <button
        className={`w-32 h-32 rounded-full text-white font-semibold transition-all duration-300 ${
          connected ? 'bg-red-500' : 'bg-blue-500'
        }`}
        onClick={handleClick}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </button>

      <div className="fixed bottom-0 left-0 w-full flex justify-center z-50">
        <div className="bottom-bar flex justify-between w-full max-w-md p-1 shadow-md bg-blue-100">
          <div className="flex items-center gap-1">
            IPv6 {ipv6Enabled ? "🟢" : "🔴"}
            <Tooltip content="IPv6 may significantly improve the speed if your ISP's IPv4 network is congested. For 4G/5G connections, IPv6 is usually enabled by default.">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="inline-block align-text-bottom text-gray-600"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
            </Tooltip>
          </div>
          <div>Balance: 10GB/10GB Free Plan</div>
        </div>
      </div>

      <AutoDismissMessageQueue ref={messageRef} />
    </div>
  );
}
