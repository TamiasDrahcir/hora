import React from 'react';
import { Button, Form } from 'react-bootstrap';
import { addDays, dateFromKey, getWeekStartDate, localDateKey, weekKeyOf } from '../utils';

interface WeekPickerProps {
  weekStart: Date;
  onSelect: (weekKey: string) => void;
}

// Lets Setup plan any week: step week by week, jump to a date, or return to the current week
const WeekPicker: React.FC<WeekPickerProps> = ({ weekStart, onSelect }) => {
  const isCurrent = weekStart.getTime() === getWeekStartDate(new Date()).getTime();

  return (
    <div className="week-picker" role="group" aria-label="Choose week to plan">
      <Button variant="outline-secondary" size="sm" className="btn-stoic" aria-label="Previous week" onClick={() => onSelect(weekKeyOf(addDays(weekStart, -7)))}>
        &lsaquo; Prev
      </Button>
      <Form.Control
        size="sm"
        type="date"
        aria-label="Jump to the week containing this date"
        title="Jump to the week containing this date"
        value={localDateKey(weekStart)}
        onChange={event => {
          const date = dateFromKey(event.target.value);
          if (date) onSelect(weekKeyOf(date));
        }}
      />
      <Button variant="outline-secondary" size="sm" className="btn-stoic" aria-label="Next week" onClick={() => onSelect(weekKeyOf(addDays(weekStart, 7)))}>
        Next &rsaquo;
      </Button>
      <Button variant="outline-secondary" size="sm" className="btn-stoic" disabled={isCurrent} onClick={() => onSelect(weekKeyOf(new Date()))}>
        This week
      </Button>
    </div>
  );
};

export default WeekPicker;
