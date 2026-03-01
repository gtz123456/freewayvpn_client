'use client'

import '@/app/i18n'
import i18next from 'i18next';
import { I18nContext } from '@/app/i18n';

import { fetch } from '@tauri-apps/plugin-http';
import { listen } from '@tauri-apps/api/event';

import { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { useRef } from 'react';

import AutoDismissMessageQueue from '@/components/AutoDismissMessageQueue';
import ToggleSwitch from "@/components/ToggleSwitch";
import Tooltip from "@/components/Tooltip";

import UserInfoCard from '@/components/UserCard';
import NodeSelector from '@/components/NodeSelector';
import NetworkMonitor from '@/components/NetworkMonitor';

import WifiToggleButton from '@/components/WifiToggleButton';


let pid;

const HEARTBEAT_INTERVAL_MS = 3000; // 3 seconds
const MAX_HEARTBEAT_FAILS = 10;

export default function Home() {
  const { lang } = useContext(I18nContext);

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
    let unlisten;
    listen('vpn-log', (event) => {
      const { msg, type } = event.payload;
      const duration = type === 'error' ? 5000 : 3000;
      messageRef.current?.addMessage(msg, type ?? 'info', duration);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

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
        messageRef.current?.addMessage(i18next.t('User data invalid'), 'error');
        localStorage.removeItem('token');
        router.push('/login');
        return;
      }
    }).catch((error) => {
      messageRef.current?.addMessage(i18next.t(`Error fetching user data: ${error.message}`), 'error');
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
            messageRef.current?.addMessage(i18next.t('Connection lost. Attempting to reconnect...'), 'warning');
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
              messageRef.current?.addMessage(`${i18next.t('Reconnected to')} ${servers[selectedServerIndex].description || servers[selectedServerIndex].ip}`, 'success');
              setConnected(true);
            } catch (error) {
              messageRef.current?.addMessage(`${i18next.t('Error reconnecting to')} ${servers[selectedServerIndex].description || servers[selectedServerIndex].ip}: ${error.message}. ${i18next.t('Please try to connect manually or switch to another node')}`, 'error');
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
      let errMsg = `Failed to connect to node (HTTP ${response.status})`;

      try {
        const data = await response.json();
        if (data.error) {
          errMsg += `: ${data.error}`;
        }
      } catch (e) {
        errMsg += `: ${response.statusText}`;
      }

      throw new Error(errMsg);
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

  // handle connect/disconnect
  const handleClick = async () => {
    const selectedServer = servers[selectedServerIndex];

    if (!selectedServer) {
      messageRef.current?.addMessage('No server selected', 'error');
      return;
    }

    if (user.traffic_used >= user.traffic_limit) {
      messageRef.current?.addMessage('Traffic limit reached', 'error');
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
  

  // Helper to format bytes to human-readable units
  function formatBytes(bytes) {
    if (bytes === undefined || bytes === null) return '0 B';
    if (typeof bytes === 'string') bytes = Number(bytes);
    if (isNaN(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    while (bytes >= 1000 && i < units.length - 1) {
      bytes /= 1000;
      i++;
    }
    return `${bytes.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }

  return (
    <div className="flex flex-col items-center h-screen gap-4 relative bg-white/20 pt-8 dark:text-gray-700">
      <UserInfoCard user={user} settings={settings} setSettings={setSettings} messageRef={messageRef} />
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

      <WifiToggleButton
        connected={connected}
        onClick={handleClick}
      />

      <div className="fixed bottom-0 left-0 w-full flex justify-center z-50 ">
        <div className="bottom-bar flex justify-between w-full max-w-md p-1 shadow-md bg-blue-50 dark:bg-[#d1d5dc] opacity-80">
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1">
              <span>IPv6</span>
              {ipv6Enabled ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 fill-green-500"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 fill-red-500"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" />
                </svg>
              )}
            </div>
            <Tooltip content={i18next.t("IPV6 explanation")}>
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
          <div>
            {i18next.t("Usage")}: {user.traffic_used ? formatBytes(user.traffic_used) : '0'}/{user.traffic_limit ? formatBytes(user.traffic_limit) : '∞'}
          </div>
        </div>
      </div>

      <AutoDismissMessageQueue ref={messageRef} />
    </div>
  );
}
