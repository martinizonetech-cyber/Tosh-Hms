import { DATA_MODE } from '../repositories/mode';

export type WsStatus = 'disconnected' | 'connecting' | 'connected';

export interface WsMessage {
  event: string;
  data?: any;
  timestamp?: string;
}

type WsEventHandler = (msg: WsMessage) => void;
type WsStatusHandler = (status: WsStatus) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private status: WsStatus = 'disconnected';
  private eventHandlers: Set<WsEventHandler> = new Set();
  private statusHandlers: Set<WsStatusHandler> = new Set();
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private isIntentionallyClosed = false;

  private resolveUrl(): string {
    const customWs = import.meta.env.VITE_WS_URL;
    if (customWs && customWs.trim()) {
      return customWs.trim();
    }
    if (typeof window === 'undefined') {
      return 'ws://127.0.0.1:4000/api/v1/ws';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // e.g. "localhost:3000" or "192.168.29.38:3000"
    return `${protocol}//${host}/api/v1/ws`;
  }

  public connect(): void {
    if (DATA_MODE !== 'api') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionallyClosed = false;
    this.setStatus('connecting');

    const url = this.resolveUrl();
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        if (event.data === 'pong') {
          return;
        }
        try {
          const parsed: WsMessage = JSON.parse(event.data);
          this.notifyHandlers(parsed);
          // Broadcast window event for any independent component listeners
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tosh-live-update', { detail: parsed }));
          }
        } catch (err) {
          console.debug('[WebSocket] Non-JSON message received:', event.data);
        }
      };

      this.ws.onerror = (err) => {
        console.debug('[WebSocket] Connection error:', err);
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.setStatus('disconnected');
        this.ws = null;
        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  public subscribe(handler: WsEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  public onStatusChange(handler: WsStatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  public getStatus(): WsStatus {
    return this.status;
  }

  private setStatus(newStatus: WsStatus): void {
    this.status = newStatus;
    this.statusHandlers.forEach((h) => {
      try {
        h(newStatus);
      } catch (err) {
        console.error('[WebSocket] Status handler error:', err);
      }
    });
  }

  private notifyHandlers(msg: WsMessage): void {
    this.eventHandlers.forEach((h) => {
      try {
        h(msg);
      } catch (err) {
        console.error('[WebSocket] Event handler error:', err);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('ping');
        } catch {
          // Handled by onclose
        }
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

export const wsClient = new WebSocketClient();
