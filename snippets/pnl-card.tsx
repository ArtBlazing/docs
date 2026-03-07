export const PnlCard = ({ token, percentage, entryPrice, currentPrice }) => {
    const isProfit = percentage >= 0;
    const colorClass = isProfit ? 'text-green-500' : 'text-red-500';

    return (
        <div className={`p-6 rounded-2xl shadow-lg my-6 ${isProfit ? 'bg-green-50/10' : 'bg-red-50/10'} border border-gray-100 dark:border-gray-800`} style={{ backgroundColor: 'var(--bg-dark)', color: 'white' }}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold font-sans">{token}</h3>
                <span className={`text-2xl font-bold ${colorClass} font-mono`}>
                    {isProfit ? '+' : ''}{percentage}%
                </span>
            </div>
            <div className="flex justify-between text-sm text-gray-400 font-mono">
                <div>
                    <p>Entry</p>
                    <p className="text-white">${entryPrice}</p>
                </div>
                <div className="text-right">
                    <p>Current</p>
                    <p className="text-white">${currentPrice}</p>
                </div>
            </div>
        </div>
    );
};
