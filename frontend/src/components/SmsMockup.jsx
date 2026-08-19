import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

/**
 * SmsMockup — shows the SMS/USSD-style messages farmers receive.
 * Two modes:
 *  - inline (default): renders inside the page as a tab panel
 *  - floating (isVisible + onClose): bottom-right phone overlay
 */
export default function SmsMockup({ isVisible, onClose, inline = false }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [replayKey, setReplayKey] = useState(0);

  const visible = inline || isVisible;

  useEffect(() => {
    if (!visible) return undefined;
    setMessages([]);

    const script = [
      { delay: 700, key: 'sms_flood_msg', type: 'alert' },
      { delay: 3000, key: 'sms_claim_msg', type: 'success' },
      { delay: 5600, key: 'sms_payout_msg', type: 'success' },
    ];
    const timers = script.map(({ delay, key, type }) =>
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: t(key),
            type,
          },
        ]);
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [visible, replayKey, t]);

  if (!visible) return null;

  const phone = (
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
              <p className="text-[10px] text-green-600 font-medium">{t('sms_verified_sender')}</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 bg-gray-300/50 rounded-full hover:bg-gray-300 text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-3 bg-gray-100 scrollbar-thin">
          <div className="text-center my-2">
            <span className="text-[10px] text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{t('sms_today')}</span>
          </div>
          {messages.map((msg, idx) => (
            <div key={idx} className="flex flex-col items-start animate-fade-in" style={{ animationFillMode: 'both' }}>
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
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-gray-300 rounded-full"></div>
      </div>
    </div>
  );

  if (!inline) {
    return <div className="fixed bottom-6 right-6 z-50 animate-slide-up">{phone}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="card-surface p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 space-y-4">
            <h3 className="text-xl font-extrabold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              {t('sms_panel_title')}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('sms_panel_desc')}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500"></span>
                {t('sms_panel_point_1')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"></span>
                {t('sms_panel_point_2')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                {t('sms_panel_point_3')}
              </li>
            </ul>
            <button
              onClick={() => setReplayKey((k) => k + 1)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Send className="h-4 w-4" />
              {t('sms_replay')}
            </button>
          </div>
          <div className="shrink-0">{phone}</div>
        </div>
      </div>
    </div>
  );
}
