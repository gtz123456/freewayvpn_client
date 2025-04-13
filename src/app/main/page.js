'use client'
// pages/index.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';

let pid, uuid, pubkey, servers;

export default function Home() {
  const [connected, setConnected] = useState(false);

  const router = useRouter();

  const server = 'http://146.235.210.34:8000';

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    }

    getUUID().then((data) => {
      uuid = data.UUID;
      console.log('UUID:', uuid);
    })

    getPubkey().then((data) => {
      pubkey = data.pubkey;
      console.log('Pubkey:', pubkey);
    })

    getServers().then((data) => {
      servers = data.servers;
      console.log('Servers:', servers);
    })
  });

  async function getUUID() {
    const token = localStorage.getItem('token');

    const response = await fetch(server + '/user', {
      method: 'GET',
      headers: {
        'Authorization': token,
      },
    });

    const data = await response.json();
    return data;
  }

  async function getPubkey() {
    const token = localStorage.getItem('token');

    const response = await fetch(server + '/realitykey', {
      method: 'GET',
      headers: {
        'Authorization': token,
      },
    });

    const data = await response.json();
    return data;
  }

  async function getServers() {
    const token = localStorage.getItem('token');

    const response = await fetch(server + '/servers', {
      method: 'GET',
      headers: {
        'Authorization': token,
      },
    });

    const data = await response.json();
    return data;
  }
  

  const handleClick = async () => {
    if (!connected) {
      await invoke('launch_xray', { uuid: uuid, pubkey: pubkey, server: servers[0].ip }).then((xraypid) => {
        pid = xraypid;
        // console.log('Xray PID:', pid);
      });
    }
    else {
      // console.log('Xray PID:', pid);
      invoke('close_xray', { pid: pid })
    }
    
    setConnected(!connected); // 切换连接状态
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
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
