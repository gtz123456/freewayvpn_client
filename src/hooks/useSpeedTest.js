import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import i18next from 'i18next';

export function useSpeedTest({ connectToNode, proxyPort = 1081 }) {
  // We track state for a single active test.
  // We'll store which server index is currently being tested.
  const [activeTestIndex, setActiveTestIndex] = useState(null);
  
  // Test statuses: idle | connecting | running | done | error
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0); // smoothed bytes/s
  const [errorMsg, setErrorMsg] = useState('');

  const smoothedRef = useRef(0);
  const tempPidRef = useRef(null);
  const unlistenRef = useRef(null);
  const isTestingRef = useRef(false);

  const cleanup = useCallback(async () => {
    isTestingRef.current = false;
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    if (tempPidRef.current) {
      try {
        await invoke('kill_process', { pid: tempPidRef.current });
      } catch (_) {}
      tempPidRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { cleanup(); }, [cleanup]);

  const [results, setResults] = useState({});
  const [queue, setQueue] = useState([]);

  // Processing the queue
  useEffect(() => {
    if (!isTestingRef.current && queue.length > 0) {
      const nextTest = queue[0];
      setQueue((prev) => prev.slice(1));
      runTest(nextTest.serverIndex, nextTest.serverObj);
    }
  }, [queue, activeTestIndex]); // activeTestIndex will become null when a test finishes

  const enqueueTest = (serverIndex, serverObj) => {
    // Ignore if already testing this node or if it's already in the queue
    if (activeTestIndex === serverIndex || queue.some((t) => t.serverIndex === serverIndex)) {
      return;
    }
    setQueue((prev) => [...prev, { serverIndex, serverObj }]);
  };

  const runTest = async (serverIndex, serverObj) => {

    const nodeKey = serverObj.service_id || serverObj.ip || serverIndex;

    isTestingRef.current = true;
    setActiveTestIndex(serverIndex);
    setStatus('connecting');
    setProgress(0);
    setSpeed(0);
    smoothedRef.current = 0;
    setErrorMsg('');

    try {
      // Step 1: get credentials from backend API for THIS specific node
      const data = await connectToNode(serverIndex);

      // Check if aborted during network call
      if (!isTestingRef.current) return;

      // Step 2: start a temporary xray without touching system proxy
      const xrayServer = serverObj.ip;
      const pid = await invoke('launch_xray_no_proxy', {
        uuid: data.uuid,
        pubkey: data.pubkey,
        server: xrayServer,
        port: data.port,
      });
      tempPidRef.current = pid;

      if (!isTestingRef.current) {
        await cleanup();
        return;
      }

      // Step 3: wait for xray to bind the port (give it ~1 s)
      await new Promise((res) => setTimeout(res, 1000));

      if (!isTestingRef.current) return;

      // Step 4: subscribe to progress events, then trigger the download
      setStatus('running');

      const unlisten = await listen('speed-test-progress', (event) => {
        if (!isTestingRef.current) return;

        const { downloaded: dl, total: tot, speed_bps, done, error } = event.payload;

        if (error) {
          setStatus('error');
          setErrorMsg(error);
          cleanup();
          return;
        }

        // Exponential moving average (α=0.3) for smooth display
        const alpha = 0.3;
        smoothedRef.current =
          smoothedRef.current === 0
            ? speed_bps
            : alpha * speed_bps + (1 - alpha) * smoothedRef.current;

        setSpeed(smoothedRef.current);
        setProgress(tot > 0 ? Math.min(100, Math.round((dl / tot) * 100)) : 0);

        if (done) {
          setSpeed(speed_bps); // final exact speed
          setStatus('done');
          setResults(prev => ({ ...prev, [nodeKey]: { speed: speed_bps } }));
          cleanup();
          setActiveTestIndex(null); // trigger next in queue
        }
      });
      unlistenRef.current = unlisten;

      // This returns after the download completes (or throws on error)
      await invoke('speed_test', { proxyPort });

    } catch (err) {
      if (!isTestingRef.current) return; // Ignore errors if we intentionally aborted
      setStatus('error');
      setErrorMsg(String(err));
      await cleanup();
      setActiveTestIndex(null); // trigger next in queue
    }
  };

  const cancelTest = async () => {
    await cleanup();
    setStatus('idle');
    setActiveTestIndex(null);
  };

  return {
    activeTestIndex,
    status,
    progress,
    speed,
    errorMsg,
    results,
    queue,
    enqueueTest,
    cancelTest,
  };
}

/** Format bytes/s → human-readable speed */
export function formatSpeed(bps) {
  if (!bps || bps <= 0) return '0 KB/s';
  const mbps = bps / (1024 * 1024);
  if (mbps >= 1) return `${mbps.toFixed(2)} MB/s`;
  return `${(bps / 1024).toFixed(1)} KB/s`;
}
