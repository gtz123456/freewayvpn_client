import React, { useState, useEffect, useRef } from "react";

// Helper component for the toggle switch
const ToggleSwitch = ({ label, isEnabled, onToggle }) => (
  <div className="flex items-center justify-between w-full py-1.5">
    <span className="text-gray-800">{label}</span>
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={isEnabled} onChange={onToggle} className="sr-only peer" />
      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 peer-checked:bg-blue-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
    </label>
  </div>
);

// Helper component for the filter checkbox
const FilterCheckbox = ({ label, isChecked, onToggle }) => (
    <label className="flex items-center space-x-3 py-1.5 cursor-pointer">
        <input 
            type="checkbox" 
            checked={isChecked} 
            onChange={onToggle}
            className="h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
        />
        <span className="text-gray-800">{label}</span>
    </label>
);


const UserInfoCard = ({ user, settings, setSettings }) => {
  // State for settings dropdown visibility
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Ref to detect clicks outside the menu
  const menuRef = useRef(null);

  // Close menu if clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Generic handler to update settings state
  const handleSettingChange = (settingName) => {
    setSettings(prev => ({
        ...prev,
        [settingName]: !prev[settingName]
    }));
  };

  return (
    <div className="w-[90%] max-w-xl mx-auto flex items-center gap-3 p-2 pl-3 rounded-xl bg-white/60 shadow-md">
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-300">
        <svg width="46" height="46" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <title>User Icon</title>
          <defs>
            <clipPath id="circleView">
              <circle cx="50" cy="50" r="50"/>
            </clipPath>
          </defs>

          <g clipPath="url(#circleView)">
            <rect width="100" height="100" fill="#cccccc"/>

            <circle cx="50" cy="42" r="23" fill="white"/>
            <circle cx="50" cy="115" r="50" fill="white"/>
          </g>
        </svg>
      </div>

      {/* Info */}
      <div className="flex flex-col">
        <div className="text-sm text-gray-600">{user.email}</div>
        <div className="text-xs text-gray-400">{user.plan}</div>
      </div>

      {/* Settings button and dropdown menu container */}
      <div ref={menuRef} className="ml-auto relative">
        {/* Settings Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-full hover:bg-gray-200 transition-colors"
          aria-haspopup="true"
          aria-expanded={isMenuOpen}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className="absolute top-full right-0 mt-2 w-56 p-4 bg-white rounded-xl shadow-lg z-10 border border-gray-100">
            <div className="flex flex-col">
                <ToggleSwitch label="ADGuard" isEnabled={settings.adGuard} onToggle={() => handleSettingChange('adGuard')} />
                <ToggleSwitch label="Load Balancing" isEnabled={settings.loadBalancing} onToggle={() => handleSettingChange('loadBalancing')} />
                
                <div className="border-t border-gray-200 my-3"></div>

                <h3 className="text-sm text-gray-500 mb-2">Filter:</h3>
                <FilterCheckbox label="NetFlix" isChecked={settings.filterNetflix} onToggle={() => handleSettingChange('filterNetflix')} />
                <FilterCheckbox label="ChatGPT" isChecked={settings.filterChatGPT} onToggle={() => handleSettingChange('filterChatGPT')} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserInfoCard;