import { useEffect, useState, useImperativeHandle, forwardRef } from 'react';

const messageTypes = {
  success: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bgColor: 'bg-green-300',
    textColor: 'text-black',
  },
  error: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bgColor: 'bg-red-500',
    textColor: 'text-black',
  },
  info: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bgColor: 'bg-blue-500',
    textColor: 'text-black',
  },
};

let idCounter = 0;

const AutoDismissMessageQueue = forwardRef(function AutoDismissMessageQueue(_, ref) {
  const [messages, setMessages] = useState([]);

  useImperativeHandle(ref, () => ({
    addMessage: (msg, type = 'error', duration = 2000) => {
      const id = idCounter++;
      setMessages((prev) => [...prev, { id, msg, type, duration, leaving: false }]);
    },
  }));

  useEffect(() => {
    messages.forEach(({ id, leaving, duration }) => {
      if (leaving) return;
      setTimeout(() => {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, leaving: true } : m)));
        setTimeout(() => {
          setMessages((prev) => prev.filter((m) => m.id !== id));
        }, 300);
      }, duration);
    });
  }, [messages]);

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 flex flex-col gap-4 w-[80%] max-w-xl z-[9999]">
      {messages.map(({ id, msg, type, leaving }) => {
        const style = messageTypes[type] || messageTypes.error;
        return (
          <div
            key={id}
            className={`flex items-center gap-4 px-6 py-4 rounded-xl shadow-xl transition duration-300 ease-in-out
              ${style.bgColor} ${style.textColor} ${leaving ? 'opacity-0 -translate-y-8' : 'opacity-90 translate-y-0'}`}
            role="alert"
            aria-live="assertive"
          >
            {style.icon}
            <p>{msg}</p>
          </div>
        );
      })}
    </div>
  );
});

export default AutoDismissMessageQueue;