import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import {
  LEAD_MINUTES,
  ensureNotificationPermission,
  notificationPermission,
  notificationsSupported,
  showNotification,
} from '../notifications';

interface NotificationSettingsProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ enabled, onChange }) => {
  // Re-read the browser permission after every interaction since the user can change it outside the app
  const [permission, setPermission] = useState(notificationPermission());

  const supported = notificationsSupported();
  const active = enabled && permission === 'granted';

  const handleToggle = async (checked: boolean) => {
    if (!checked) {
      onChange(false);
      return;
    }
    const granted = await ensureNotificationPermission();
    setPermission(notificationPermission());
    onChange(granted);
  };

  let hint = `Alerts ${LEAD_MINUTES} min before a block starts and when one ends uncompleted. They appear while HORA is open in a browser tab.`;
  if (!supported) hint = 'Notifications are not supported in this browser.';
  else if (permission === 'denied') hint = 'Notifications are blocked. Allow them for this site in your browser settings.';

  return (
    <div className="notification-settings d-flex align-items-center gap-2" title={hint}>
      <Form.Check
        type="switch"
        id="notification-switch"
        label="Notifications"
        className="small mb-0"
        checked={active}
        disabled={!supported || permission === 'denied'}
        onChange={event => handleToggle(event.target.checked)}
      />
      {active && (
        <Button
          variant="link"
          size="sm"
          className="p-0 small"
          onClick={() => showNotification('HORA notifications are on', hint, 'hora-test')}
        >
          Test
        </Button>
      )}
      {(!supported || permission === 'denied') && <small className="text-muted">{hint}</small>}
    </div>
  );
};

export default NotificationSettings;
