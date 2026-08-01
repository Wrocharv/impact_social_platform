import { useEffect, useState } from "react";

interface AnimatedProgressBarProps {
  current: number;
  goal: number;
  animated?: boolean;
  showLabel?: boolean;
}

export default function AnimatedProgressBar({
  current,
  goal,
  animated = true,
  showLabel = true,
}: AnimatedProgressBarProps) {
  const [displayPercentage, setDisplayPercentage] = useState(0);
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
  const safeGoal = Number.isFinite(goal) ? Math.max(0, goal) : 0;
  const percentage = safeGoal > 0
    ? Math.min(100, Math.max(0, Math.round((safeCurrent / safeGoal) * 100)))
    : 0;

  useEffect(() => {
    if (!animated) {
      setDisplayPercentage(percentage);
      return;
    }

    // Animate from 0 to percentage
    let currentValue = 0;
    const interval = setInterval(() => {
      currentValue += Math.ceil(percentage / 20);
      if (currentValue >= percentage) {
        setDisplayPercentage(percentage);
        clearInterval(interval);
      } else {
        setDisplayPercentage(currentValue);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [percentage, animated]);

  return (
    <div className="w-full">
      <div className="relative w-full bg-[#dcdcdc] rounded-full h-3 overflow-hidden shadow-inner">
        {/* Animated background */}
        <div
          className="h-full bg-gradient-to-r from-[#228B22] to-[#1a6b1a] transition-all duration-500 ease-out relative overflow-hidden"
          style={{ width: `${displayPercentage}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
        </div>
      </div>

      {showLabel && (
        <div className="flex justify-between mt-2 text-sm">
          <span className="font-semibold text-[#2d2d2d]">
            {(safeCurrent / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </span>
          <span className="font-bold text-[#228B22]">{displayPercentage}%</span>
        </div>
      )}
    </div>
  );
}
