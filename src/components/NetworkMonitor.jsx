import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

import '@/app/i18n'
import i18next from 'i18next';

const parseStats = (data) => {
  const result = {
    downlink: 0,
    uplink: 0
  };

  data = JSON.parse(data);

  if (!data || !data.stat) {
    return result;
  }

  for (const item of data.stat) {
    if (item.name === "outbound>>>proxy>>>traffic>>>downlink") {
      result.downlink = item.value ?? 0;
    } else if (item.name === "outbound>>>proxy>>>traffic>>>uplink") {
      result.uplink = item.value ?? 0;
    }
  }

  return result;
}

const NetworkMonitor = ({ isConnected }) => {
  const [speed, setSpeed] = useState({ downlink: 0, uplink: 0 });
  const [prevStats, setPrevStats] = useState({ downlink: 0, uplink: 0 });

  const interval = 3000;

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        if (!isConnected) {
          setSpeed({ downlink: 0, uplink: 0 });
          setPrevStats({ downlink: 0, uplink: 0 });
          return;
        }

        const data = await invoke('get_xray_stats');
        console.log('Raw xray stats data:', data);

        const newStats = parseStats(data);

        console.log('Fetched xray stats:', newStats);

        const deltaDown = newStats.downlink - prevStats.downlink;
        const deltaUp = newStats.uplink - prevStats.uplink;

        setSpeed({
          downlink: (deltaDown / interval  * 8).toFixed(1),
          uplink: (deltaUp / interval * 8).toFixed(1)
        });

        setPrevStats(newStats);
      } catch (error) {
        console.error('Failed to get xray stats:', error);
      }
    }, interval);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, prevStats]);

  const formatSpeed = (value) => {
    const num = parseFloat(value);
    if (num >= 1024) {
      return `${(num / 1024).toFixed(1)} Mb/s`;
    }
    return `${num} Kb/s`;
  };

  const formatTransfer = (value) => {
    const num = parseFloat(value) / 8000; // convert to kB
    if (num >= 1024) {
      return `${(num / 1024).toFixed(1)} MB`;
    }
    return `${num.toFixed(1)} kB`;
  };

  return (
    <div className="w-[90%] max-w-xl mx-auto flex items-center gap-3 p-2 pl-3 rounded-xl bg-white/60 shadow-md mt-4">
      <div className="flex w-full">
        <div className="flex-1 flex flex-col items-center">
          <div>{i18next.t('Speed')}</div>
          <span className="text-sm text-gray-600 mt-1">{i18next.t('Download')}: {formatSpeed(speed.downlink)}</span>
          <span className="text-sm text-gray-600 mt-1">{i18next.t('Upload')}: {formatSpeed(speed.uplink)}</span>
        </div>
        <div className="w-px bg-gray-300 mx-4" style={{ minHeight: '48px' }} />
        <div className="flex-1 flex flex-col items-center">
          <div>{i18next.t('Transfer')}</div>
          <span className="text-sm text-gray-600 mt-1">{i18next.t('Download')}: {formatTransfer(prevStats.downlink)}</span>
          <span className="text-sm text-gray-600 mt-1">{i18next.t('Upload')}: {formatTransfer(prevStats.uplink)}</span>
        </div>
      </div>
    </div>
  );
};

export default NetworkMonitor;
