import React, { useState, useEffect } from 'react';
import { MessageSquare, X } from 'lucide-react';

export default function SmsMockup({ isVisible, onClose }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (isVisible) {
      setMessages([]);
      const t1 = setTimeout(() => {
        setMessages(prev => [...prev, {
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          text: "[ALERT] Flood risk HIGH for your farm in 3 days. Evacuate equipment.",
          type: 'alert'
        }]);
      }, 1000);

      const t2 = setTimeout(() => {
        setMessages(prev => [...prev, {
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          text: "[AgriGuard] Claim #CLM-0847 auto-filed based on satellite data. Payout expected within 24h.",
          type: 'success'
        }]);
      }, 4000);

      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className="w-72 bg-gray-900 rounded-[3rem] p-3 shadow-2xl border-4 border-gray-800 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-2xl z-20"></div>
        <div className="bg-gray-100 h-96 rounded-[2.2rem] overflow-hidden flex flex-col relative">
          <div className="bg-gray-200/80 backdrop-blur-md pt-8 pb-3 px-4 flex items-center justify-between border-b border-gray-300 shadow-sm z-10">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">AgriGuard SMS</p>
                <p className="text-[10px] text-green-600 font-medium">Verified Sender</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 bg-gray-300/50 rounded-full hover:bg-gray-300 text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-3 bg-gray-100">
            <div className="text-center my-2">
              <span className="text-[10px] text-gray-500 bg-gray-200 px-2 py-1 rounded-full">Today</span>
            </div>
            {messages.map((msg, idx) => (
              <div key={idx} className="flex flex-col items-start animate-fade-in" style={{animationFillMode: 'both'}}>
                <div className={`p-3 rounded-2xl rounded-tl-sm text-sm shadow-sm max-w-[90%] ${
                  msg.type === 'alert' ? 'bg-red-50 text-red-900 border border-red-100' : 'bg-white text-gray-800 border border-gray-200'
                }`}>
                  {msg.text}
                </div>
                <span className="text-[9px] text-gray-400 mt-1 ml-1">{msg.time}</span>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex space-x-1 items-center bg-gray-200 px-3 py-2 rounded-full">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                </div>
              </div>
            )}
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-gray-300 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}