export const TelegramChat = ({ messages = [] }) => {
  return (
    <div className="flex flex-col space-y-4 w-full max-w-lg mx-auto my-8 p-4 rounded-xl border border-gray-100 dark:border-gray-800" style={{ backgroundColor: 'var(--bg-dark)', backgroundImage: 'linear-gradient(180deg, rgba(0,6,26,1) 0%, rgba(0,122,255,0.05) 100%)' }}>
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`relative max-w-[85%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${msg.sender === 'user'
              ? 'bg-[#007aff] text-white self-end rounded-br-sm'
              : 'bg-[#1c242d] text-white self-start rounded-bl-sm border border-gray-800'
            }`}
        >
          <div className="font-sans whitespace-pre-wrap">{msg.text}</div>
          <span className={`text-[10px] block text-right mt-1.5 opacity-70`}>
            {msg.timestamp}
          </span>
        </div>
      ))}
    </div>
  );
};
