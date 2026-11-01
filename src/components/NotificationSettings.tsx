import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import {
  LEAD_MINUTES,
  ensureNotificationPermission,
  notificationPermission,
  notificationsSupported,
  showNotification,
} from '../notifications';
import {
  isValidDiscordWebhook,
  testDiscordWebhook,
  unsubscribePush,
  workerConfigured,
  type AlertSyncState,
} from '../push';

interface NotificationSettingsProps {
  enabled: boolean;
  alerts: AlertSyncState;
  discordWebhook: string;
  onChange: (enabled: boolean) => void;
  onDiscordWebhookChange: (webhook: string) => void;
}

const NotificationSettings: React.FC<NotificationSettingsProps> = ({
  enabled,
  alerts,
  discordWebhook,
  onChange,
  onDiscordWebhookChange,
}) => {
  const { push, discord } = alerts;

  // Re-read the browser permission after every interaction since the user can change it outside the app
  const [permission, setPermission] = useState(notificationPermission());
  const [showDiscord, setShowDiscord] = useState(false);
  const [draft, setDraft] = useState(discordWebhook);
  const [checking, setChecking] = useState(false);
  const [discordMessage, setDiscordMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const supported = notificationsSupported();
  const active = enabled && permission === 'granted';
  const discordReady = discord.status === 'ready';

  const handleToggle = async (checked: boolean) => {
    if (!checked) {
      onChange(false);
      await unsubscribePush();
      return;
    }
    const granted = await ensureNotificationPermission();
    setPermission(notificationPermission());
    onChange(granted);
  };

  const handleSaveDiscord = async () => {
    const webhook = draft.trim();
    if (!isValidDiscordWebhook(webhook)) {
      setDiscordMessage({ ok: false, text: "That doesn't look like a Discord webhook URL. It starts with https://discord.com/api/webhooks/" });
      return;
    }
    setChecking(true);
    setDiscordMessage(null);
    try {
      // Only keep a webhook that Discord actually accepted
      await testDiscordWebhook(webhook);
      onDiscordWebhookChange(webhook);
      setDiscordMessage({ ok: true, text: 'Connected. A test message was just sent to your Discord channel.' });
    } catch (error) {
      setDiscordMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setChecking(false);
    }
  };

  const handleRemoveDiscord = () => {
    onDiscordWebhookChange('');
    setDraft('');
    setDiscordMessage(null);
  };

  let hint = `Alerts ${LEAD_MINUTES} min before a block starts and when one ends uncompleted.`;
  hint += push.status === 'ready' || discordReady
    ? ' Background alerts are on, so they arrive even when HORA is closed.'
    : ' They appear while HORA is open in a tab.';
  if (!supported) hint = 'Notifications are not supported in this browser.';
  else if (permission === 'denied') hint = 'Notifications are blocked. Allow them for this site in your browser settings.';

  return (
    <div className="notification-settings d-flex flex-wrap align-items-center gap-2" title={hint}>
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
      {workerConfigured && (
        <Button
          variant="link"
          size="sm"
          className="p-0 small"
          aria-expanded={showDiscord}
          onClick={() => setShowDiscord(open => !open)}
        >
          Discord{discordReady ? ' (on)' : ''}
        </Button>
      )}
      {active && push.status === 'syncing' && <small className="text-muted">Setting up background alerts...</small>}
      {active && push.status === 'ready' && <small className="text-muted">Background alerts on</small>}
      {active && push.status === 'error' && (
        <small className={discordReady ? 'text-muted' : 'text-danger'}>
          {discordReady
            ? 'Browser push is unavailable here; Discord covers background alerts.'
            : "Background alerts couldn't be set up. Alerts still work while HORA is open."}
        </small>
      )}
      {(!supported || permission === 'denied') && <small className="text-muted">{hint}</small>}
      {active && push.status === 'error' && push.error && (
        <small className="text-muted w-100 notification-error">{push.error}</small>
      )}

      {showDiscord && (
        <div className="discord-panel w-100">
          <div className="d-flex gap-2 align-items-center">
            <Form.Control
              size="sm"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Discord webhook URL"
              aria-label="Discord webhook URL"
              value={draft}
              onChange={event => { setDraft(event.target.value); setDiscordMessage(null); }}
            />
            <Button size="sm" className="btn-stoic text-nowrap" disabled={checking || !draft.trim()} onClick={handleSaveDiscord}>
              {checking ? 'Checking...' : 'Save and send test'}
            </Button>
            {discordWebhook && (
              <Button variant="link" size="sm" className="text-danger p-0 text-nowrap" onClick={handleRemoveDiscord}>
                Remove
              </Button>
            )}
          </div>
          {discordMessage && (
            <small className={discordMessage.ok ? 'text-success' : 'text-danger'}>{discordMessage.text}</small>
          )}
          {!discordMessage && discord.status === 'error' && discord.error && (
            <small className="text-danger">{discord.error}</small>
          )}
          {!discordMessage && discordReady && <small className="text-muted d-block">Discord alerts are on.</small>}
          <small className="text-muted d-block mt-1">
            In Discord: Server Settings &gt; Integrations &gt; Webhooks &gt; New Webhook &gt; Copy Webhook URL. Use a
            private server of your own, and set that channel's notifications to All Messages so every alert pings
            your phone and desktop.
          </small>
        </div>
      )}
    </div>
  );
};

export default NotificationSettings;
