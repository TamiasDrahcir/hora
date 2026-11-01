import React from 'react';
import { formatWeekRange, getWeekStartDate } from '../utils';

interface WeekBannerProps {
  weekStart: Date;
  showNote?: boolean; // the past/upcoming notes are written for Execute and Report
}

// Says exactly which week a screen is about, and whether it is this week, a past one, or an upcoming one
const WeekBanner: React.FC<WeekBannerProps> = ({ weekStart, showNote = true }) => {
  const thisWeek = getWeekStartDate(new Date()).getTime();
  const start = weekStart.getTime();
  const state = start === thisWeek ? 'current' : start < thisWeek ? 'past' : 'upcoming';
  const label = { current: 'This week', past: 'Past week', upcoming: 'Upcoming week' }[state];

  return (
    <div className="week-banner text-center mb-3">
      <span className="week-banner-dates">Week of {formatWeekRange(weekStart)}</span>
      <span className={`week-banner-badge ${state}`}>{label}</span>
      {showNote && state === 'past' && (
        <div className="week-banner-note">
          This schedule is for {formatWeekRange(weekStart)}. Go to Setup and generate a new schedule to plan the current
          week ({formatWeekRange(getWeekStartDate(new Date()))}).
        </div>
      )}
      {showNote && state === 'upcoming' && (
        <div className="week-banner-note">Starts {weekStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.</div>
      )}
    </div>
  );
};

export default WeekBanner;
