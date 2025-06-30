'use client'

import { fetch } from '@tauri-apps/plugin-http';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { useRef } from 'react';

import AutoDismissMessageQueue from '@/components/AutoDismissMessageQueue';
import ToggleSwitch from "@/components/ToggleSwitch";
import Tooltip from "@/components/Tooltip";

import UserInfoCard from '@/components/UserInfoCard';
import NodeSelector from '@/components/NodeSelector';
import NetworkMonitor from '@/components/NetworkMonitor';


let pid;

const HEARTBEAT_INTERVAL_MS = 3000; // 3 seconds
const MAX_HEARTBEAT_FAILS = 10;

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

  const [user, setUser] = useState({
    email: '',
    plan: '',
    uuid: '',
  });

  // State for all settings values
  const [settings, setSettings] = useState({
    adGuard: true,
    loadBalancing: false,
    filterNetflix: false,
    filterChatGPT: true,
  });


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

    getUser().then((data) => {
      setUser(data);
      console.log('User data:', data);
      if (!data || !data.uuid) {
        messageRef.current?.addMessage('User data is invalid. Please log in again.', 'error');
        localStorage.removeItem('token');
        router.push('/login');
        return;
      }
    }).catch((error) => {
      messageRef.current?.addMessage(`Error fetching user data: ${error.message}`, 'error');
    });

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
    let isActive = true;

    const heartbeatLoop = async () => {
      while (isActive && connected) {
        try {
          console.log("Sending heartbeat...");
          await sendHeartbeat();
          heartbeatFailsRef.current = 0;
          console.log("Heartbeat success.");
        } catch (error) {
          heartbeatFailsRef.current++;
          console.error(`Heartbeat failed (${heartbeatFailsRef.current}/${MAX_HEARTBEAT_FAILS}):`, error);
          if (heartbeatFailsRef.current === MAX_HEARTBEAT_FAILS) {
            // try to reconnect
            setConnected(false);
            pid && await invoke('close_xray', { pid: pid });
            pid = null;

            try {
              const data = await connectToNode();
              
              await invoke('launch_xray', {
                uuid: data.uuid,
                pubkey: data.pubkey,
                server: ipv6checked && servers[selectedServerIndex].ipv6 ? servers[selectedServerIndex].ipv6 : servers[selectedServerIndex].ip,
                port: data.port,
              }).then((xraypid) => {
                pid = xraypid;
              });
              messageRef.current?.addMessage(`Reconnected to ${servers[selectedServerIndex].description || servers[selectedServerIndex].ip}`, 'success');
              setConnected(true);
            } catch (error) {
              messageRef.current?.addMessage(`Error reconnecting to ${servers[selectedServerIndex].description || servers[selectedServerIndex].ip}: ${error.message}. Please try to connect manually or switch to another node`, 'error');
            }
            break;
          }
        }

        await new Promise(res => setTimeout(res, HEARTBEAT_INTERVAL_MS));
      }
    };

    if (connected) {
      heartbeatFailsRef.current = 0;
      heartbeatLoop();
    }

    return () => {
      isActive = false;
    };
  }, [connected]);

  async function getUser() {
    const token = localStorage.getItem('token');
    const response = await fetch(server + '/user', {
      method: 'GET',
      headers: { 'Authorization': token },
    });
    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }
    return await response.json();
  }

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

  async function sendHeartbeat() {
    let serviceID = servers[selectedServerIndex].serviceid;
    if (!server) {
      return Promise.reject(new Error('No server selected'));
    }

    const token = localStorage.getItem('token');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(server + '/heartbeat?serviceid=' + serviceID, {
        method: 'POST',
        headers: { 'Authorization': token },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error('Failed to send heartbeat');
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Heartbeat request timed out');
      }
      throw error;
    }
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
          port: data.port,
        }).then((xraypid) => {
          pid = xraypid;
        });

        messageRef.current?.addMessage(`Connected to ${selectedServer.description || selectedServer.ip}`, 'success');
        setConnected(!connected);
      } catch (error) {
        // console.error('Error connecting to node:', error);
        messageRef.current?.addMessage(`Error connecting to ${selectedServer.description || selectedServer.ip}: ${error.message}`, 'error');
        return;
      }
    } else {
      invoke('close_xray', { pid: pid });
      setConnected(!connected);
    }
  };
  

  return (
    <div className="flex flex-col items-center h-screen gap-4 relative bg-white/20 mt-8">
      <UserInfoCard user={user} settings={settings} setSettings={setSettings} />
      <NodeSelector
        servers={servers}
        selectedServerIndex={selectedServerIndex}
        setSelectedServerIndex={setSelectedServerIndex}
        connected={connected}
      />
      <NetworkMonitor isConnected={connected} />
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
        className={`w-36 h-16 rounded-3xl text-white font-semibold transition-all duration-300 
          ${connected ? 'bg-red-400 hover:bg-red-500' : 'bg-blue-400 hover:bg-blue-500'}
          hover:scale-103 shadow-lg flex items-center justify-center`
        }
        onClick={handleClick}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </button>

      <div className="fixed bottom-0 left-0 w-full flex justify-center z-50">
        <div className="bottom-bar flex justify-between w-full max-w-md p-1 shadow-md bg-blue-50">
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
          <div>Balance: {user.traffic_used ? user.traffic_used : 0}GB/{user.traffic_limit ? user.traffic_limit : '∞'}GB</div>
        </div>
      </div>

      <AutoDismissMessageQueue ref={messageRef} />
    </div>
  );
}
