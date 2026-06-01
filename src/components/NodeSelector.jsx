import React, { useState, useEffect, useRef } from "react";

import '@/app/i18n'
import i18next from 'i18next';
import { useSpeedTest, formatSpeed } from "../hooks/useSpeedTest";

const getCountryCode = (description) => {
  if (!description || description.length < 2) return "us"; // fallback
  return description.slice(0, 2).toLowerCase(); // e.g., "US" => "us"
};

const NodeSelector = ({
  servers,
  selectedServerIndex,
  setSelectedServerIndex,
  connected = false,
  connectToNode,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedServer = servers[selectedServerIndex];
  const countryCode = getCountryCode(selectedServer?.description);

  const menuRef = useRef(null);

  const { activeTestIndex, status, progress, speed, errorMsg, startTest } = useSpeedTest({ connectToNode });

  const handleSelect = (index) => {
    setSelectedServerIndex(index);
    setDropdownOpen(false);
  };

  const ChevronIcon = ({ open }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-7 h-7"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      {open ? (
        // ChevronUp
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      ) : (
        // ChevronDown
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      )}
    </svg>
  );

  // Close menu if clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  return (
    <div ref={menuRef} className="relative w-[90%] max-w-xl p-3 mt-2 border-white/90 rounded-lg bg-white/60 shadow flex flex-col gap-2">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3 w-full cursor-pointer" onClick={() => setDropdownOpen((prev) => !prev)}>
        <div className="w-13 h-9 flex items-center justify-center rounded-lg overflow-hidden">
          <img
            src={`https://flagcdn.com/w80/${countryCode}.png`}
            alt={countryCode}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col flex-grow">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{i18next.t('Select node:')}</span>
            <div className="text-sm text-gray-500 border px-1 rounded-md ml-1">{selectedServer?.tag ?? i18next.t('Free')}</div>
          </div>
          <div className="text-md">
            {selectedServer?.description || selectedServer?.ip}
          </div>
        </div>
        {selectedServer?.tag && (
          <span className="text-sm border px-2 py-1 rounded-md">
            {selectedServer.tag}
          </span>
        )}
        {/* Ping color for selected server */}
        <span className={`text-md ${
          (() => {
            const pingValue = typeof selectedServer?.ping === "string" ? parseInt(selectedServer?.ping, 10) : selectedServer?.ping;
            if (!isNaN(pingValue)) {
              if (pingValue < 100) return "text-green-600";
              if (pingValue < 250) return "text-yellow-500";
              return "text-red-500";
            }
            return "text-gray-700";
          })()
        }`}>
          {selectedServer?.ping ?? "- "}ms
        </span>
        </div>
        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="pl-3"
        >
          <ChevronIcon open={dropdownOpen} />
        </button>
      </div>

      {dropdownOpen && (
        <div className="absolute left-0 top-full mt-2 w-full max-w-xl bg-white rounded-xl shadow-lg z-10 max-h-96 overflow-y-auto">
          {servers.map((s, index) => {
            const code = getCountryCode(s.description);
            // Determine ping color
            let pingColor = "text-gray-700";
            const pingValue = typeof s.ping === "string" ? parseInt(s.ping, 10) : s.ping;
            if (!isNaN(pingValue)) {
              if (pingValue < 100) pingColor = "text-green-600";
              else if (pingValue < 250) pingColor = "text-yellow-500";
              else pingColor = "text-red-500";
            }

            const isTesting = activeTestIndex === index;
            const isDone = isTesting && status === 'done';
            const isRunning = isTesting && (status === 'connecting' || status === 'running');
            const isError = isTesting && status === 'error';

            return (
              <div
              key={index}
              onClick={() => handleSelect(index)}
              className={`p-3 cursor-pointer hover:bg-gray-100 flex items-center justify-between ${
                index === selectedServerIndex ? "bg-gray-50" : ""
              }`}
              >
              <div className="flex items-center gap-3">
                <img
                src={`https://flagcdn.com/w40/${code}.png`}
                alt={code}
                className="w-7 h-5 object-cover rounded"
                />
                <div className="flex flex-row items-center gap-2">
                <div className="">{s.description || s.ip}</div>
                <div className="text-sm text-gray-500 border px-1 rounded-md">{s.tag ?? i18next.t("Free")}</div>
                </div>
              </div>
              
              {/* Right side: Speed Test + Ping */}
              <div className="flex items-center gap-3">
                {/* Speed test area */}
                <div 
                  className="flex items-center"
                  onClick={(e) => {
                    e.stopPropagation(); // prevent row selection
                    startTest(index, s);
                  }}
                >
                  {isTesting ? (
                    <div className="text-xs w-20 text-right">
                      {status === 'connecting' && <span className="text-gray-400">...</span>}
                      {status === 'running' && <span className="text-blue-500">{formatSpeed(speed)}</span>}
                      {status === 'done' && <span className="text-green-600 font-medium">{formatSpeed(speed)}</span>}
                      {status === 'error' && <span className="text-red-500" title={errorMsg}>Fail</span>}
                    </div>
                  ) : (
                    <button 
                      className="text-gray-400 hover:text-blue-500 p-1.5 rounded-md bg-gray-50 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-colors"
                      title={i18next.t('Test Speed')}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 14l4-4" />
                        <path d="M3.34 16A10 10 0 1 1 20.66 16" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className={`text-sm w-12 text-right ${pingColor}`}>{s.ping ?? "- "}ms</div>
              </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NodeSelector;
