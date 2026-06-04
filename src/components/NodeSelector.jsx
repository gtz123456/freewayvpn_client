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

  const getPingColor = (ping) => {
    const pingValue = typeof ping === "string" ? parseInt(ping, 10) : ping;
    if (isNaN(pingValue)) return "text-gray-400";
    if (pingValue < 100) return "text-green-600";
    if (pingValue < 250) return "text-yellow-500";
    return "text-red-500";
  };
  
  const getPingBgColor = (ping) => {
    const pingValue = typeof ping === "string" ? parseInt(ping, 10) : ping;
    if (isNaN(pingValue) || pingValue === 0) return "bg-gray-400";
    if (pingValue < 100) return "bg-green-500";
    if (pingValue < 250) return "bg-yellow-500";
    return "bg-red-500";
  };

  const { activeTestIndex, status, progress, speed, errorMsg, results, startTest } = useSpeedTest({ connectToNode });

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
          <div className="relative flex-shrink-0">
            <img
              src={`https://flagcdn.com/w80/${countryCode}.png`}
              alt={countryCode}
              className="w-11 h-7 object-cover rounded shadow-sm"
            />
            <span className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-white rounded-full shadow-sm ${getPingBgColor(selectedServer?.ping)}`}></span>
          </div>
          
          <div className="flex flex-col flex-grow overflow-hidden">
            <div className="text-sm font-medium text-gray-800 truncate">
              {selectedServer?.description || selectedServer?.ip}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {(!selectedServer?.tags || selectedServer.tags.length === 0) ? (
                <span className="text-[10px] px-1.5 py-[1px] rounded-md bg-gray-100 text-gray-600 border border-gray-200/60 leading-tight">
                  {i18next.t('Free')}
                </span>
              ) : (
                selectedServer.tags.map((tag, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-[1px] rounded-md bg-gray-100 text-gray-600 border border-gray-200/60 leading-tight">
                    {tag}
                  </span>
                ))
              )}
              {selectedServer?.ipv6 && selectedServer.ipv6.includes(':') && (
                <span className="text-[10px] px-1.5 py-[1px] rounded-md bg-blue-50 text-blue-600 border border-blue-200/60 leading-tight">
                  IPv6
                </span>
              )}
            </div>
          </div>
          
          <span className={`text-md whitespace-nowrap font-medium ${getPingColor(selectedServer?.ping)}`}>
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
            const isTesting = activeTestIndex === index;
            const isDone = isTesting && status === 'done';
            const isRunning = isTesting && (status === 'connecting' || status === 'running');
            const isError = isTesting && status === 'error';

            return (
              <div
              key={index}
              onClick={() => handleSelect(index)}
              className={`p-3 cursor-pointer hover:bg-gray-100 flex flex-col gap-1.5 transition-colors ${
                index === selectedServerIndex ? "bg-gray-50" : ""
              }`}
              >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <img
                      src={`https://flagcdn.com/w40/${code}.png`}
                      alt={code}
                      className="w-7 h-5 object-cover rounded shadow-sm"
                    />
                    <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 border-2 border-white rounded-full shadow-sm ${getPingBgColor(s.ping)}`}></span>
                  </div>
                  <span className="text-sm font-medium text-gray-800">{s.description || s.ip}</span>
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
                  ) : results[s.service_id || s.ip || index] ? (
                    <div 
                      className="text-xs text-green-600/80 hover:text-green-600 font-medium w-16 text-right truncate cursor-pointer transition-colors"
                      title={i18next.t('Test Speed')}
                    >
                      {formatSpeed(results[s.service_id || s.ip || index].speed)}
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

                <div className={`text-sm w-12 text-right ${getPingColor(s.ping)}`}>{s.ping ?? "- "}ms</div>
              </div>
              </div>

              {/* 第二行：Micro Badges */}
              <div className="flex flex-wrap items-center gap-1.5 pl-[40px]">
                {(!s.tags || s.tags.length === 0) ? (
                  <span className="text-[10px] px-1.5 py-[1px] rounded-md bg-gray-100 text-gray-600 border border-gray-200/60 leading-tight">
                    {i18next.t("Free")}
                  </span>
                ) : (
                  s.tags.map((tag, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-[1px] rounded-md bg-gray-100 text-gray-600 border border-gray-200/60 leading-tight">
                      {tag}
                    </span>
                  ))
                )}
                {s.ipv6 && s.ipv6.includes(':') && (
                  <span className="text-[10px] px-1.5 py-[1px] rounded-md bg-blue-50 text-blue-600 border border-blue-200/60 leading-tight">
                    IPv6
                  </span>
                )}
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
