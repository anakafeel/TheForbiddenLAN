// RelaySocket — persistent WebSocket connection to the DigitalOcean relay server
import { WebSocket } from "ws";
import type { RelayMessage, MessageType } from "./types";

type Handler = (msg: RelayMessage) => void;

export class RelaySocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<MessageType | "*", Handler[]>();
  private url = "";
  private jwt = "";
  private reconnectDelay = 1000;

  connect(url: string, jwt: string): void {
    this.url = url;
    this.jwt = jwt;
    this.open();
  }

  private open(): void {
    this.ws = new WebSocket(`${this.url}?token=${this.jwt}`);

    this.ws.onopen = () => {
      console.log("[RelaySocket] connected");
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const msg: RelayMessage = JSON.parse(e.data);
        this.handlers.get(msg.type)?.forEach((h) => h(msg));
        this.handlers.get("*")?.forEach((h) => h(msg));
      } catch {
        console.warn("[RelaySocket] bad message", e.data);
      }
    };

    this.ws.onclose = () => {
      console.warn(
        "[RelaySocket] closed — reconnecting in",
        this.reconnectDelay,
      );
      setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
        this.open();
      }, this.reconnectDelay);
    };
  }

  on(type: MessageType | "*", handler: Handler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  off(type: MessageType | "*", handler: Handler): void {
    const list = this.handlers.get(type) ?? [];
    this.handlers.set(
      type,
      list.filter((h) => h !== handler),
    );
  }

  send(msg: RelayMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[RelaySocket] not connected — message dropped", msg.type);
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
