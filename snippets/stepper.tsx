export const Stepper = ({ steps = [], currentStep = 0 }) => {
    return (
        <div className="w-full my-8">
            <div className="flex items-center justify-between relative">
                <div className="absolute left-0 top-1/2 w-full h-1 bg-gray-200 -z-10 -translate-y-1/2 rounded"></div>
                <div
                    className="absolute left-0 top-1/2 h-1 bg-[#007FFF] -z-10 -translate-y-1/2 rounded transition-all duration-300"
                    style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
                ></div>

                {steps.map((step, idx) => {
                    const isActive = idx <= currentStep;
                    return (
                        <div key={idx} className="flex flex-col items-center">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 ${isActive ? 'bg-[#007FFF] text-white' : 'bg-white border-2 border-gray-200 text-gray-400'
                                    }`}
                            >
                                {idx + 1}
                            </div>
                            <span className={`mt-2 text-xs font-semibold ${isActive ? 'text-[#007FFF]' : 'text-gray-400'}`}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
