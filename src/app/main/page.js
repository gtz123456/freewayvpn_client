'use client'
// pages/index.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';

let pid;

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [uuid, setUUID] = useState('');
  const [pubkey, setPubkey] = useState('');
  const [servers, setServers] = useState([]);
  const [selectedServerIndex, setSelectedServerIndex] = useState(0);

  const router = useRouter();
  const server = 'http://146.235.210.34:8001';

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    getUUID().then((data) => {
      setUUID(data.UUID);
      console.log('UUID:', data.UUID);
    });

    getPubkey().then((data) => {
      setPubkey(data.pubkey);
      console.log('Pubkey:', data.pubkey);
    });

    getServers().then((data) => {
      setServers(data.servers);
      console.log('Servers:', data.servers);
    });
  }, []);

  async function getUUID() {
    const token = localStorage.getItem('token');
    const response = await fetch(server + '/user', {
      method: 'GET',
      headers: { 'Authorization': token },
    });
    return await response.json();
  }

  async function getPubkey() {
    const token = localStorage.getItem('token');
    const response = await fetch(server + '/realitykey', {
      method: 'GET',
      headers: { 'Authorization': token },
    });
    return await response.json();
  }

  async function getServers() {
    const token = localStorage.getItem('token');
    const response = await fetch(server + '/servers', {
      method: 'GET',
      headers: { 'Authorization': token },
    });
    console.log('Servers:', response);
    return await response.json();
  }

  const handleClick = async () => {
    const selectedServer = servers[selectedServerIndex];

    if (!selectedServer) {
      alert("No server selected");
      return;
    }

    if (!connected) {
      console.log('Connecting to server:', selectedServer.ip);
      await invoke('launch_xray', {
        uuid: uuid,
        pubkey: pubkey,
        server: selectedServer.ip
      }).then((xraypid) => {
        pid = xraypid;
      });
    } else {
      invoke('close_xray', { pid: pid });
    }

    setConnected(!connected);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 gap-4">
      <div className="text-center">
        <p>
          Current status: {servers[selectedServerIndex]?.description || servers[selectedServerIndex]?.ip || "unknown"}{' '}
          {connected ? "🟢" : "🔴"}
        </p>
      </div>

      <select
        className="p-2 border rounded bg-white shadow"
        value={selectedServerIndex}
        onChange={(e) => setSelectedServerIndex(Number(e.target.value))}
        disabled={connected}
      >
        {servers.map((s, index) => (
          <option key={index} value={index}>
            {s.description ? s.description : s.ip}
          </option>
        ))}
      </select>

      <button
        className={`w-32 h-32 rounded-full text-white font-semibold transition-all duration-300 ${
          connected ? 'bg-red-500' : 'bg-blue-500'
        }`}
        onClick={handleClick}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  );
}
