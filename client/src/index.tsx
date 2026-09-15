import type { PipecatClient } from "@pipecat-ai/client-js";
import { RTVIEvent } from "@pipecat-ai/client-js";
import type { WebSocketTransport } from "@pipecat-ai/websocket-transport";
import { MoonIcon, SunIcon } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  Console,
  type ConsoleProps,
} from "@/components/pipecat/console/console";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import "./index.css";

type TransportType =
  | "smallwebrtc"
  | "daily"
  | "websocket"
  | "twilio"
  | "livekit"
  | "moq";

const TRANSPORT_OPTIONS: { value: TransportType; label: string }[] = [
  { value: "smallwebrtc", label: "SmallWebRTC" },
  { value: "daily", label: "Daily" },
  { value: "websocket", label: "WebSocket" },
  // Twilio is also a websocket transport, just with a special serializer
  { value: "twilio", label: "Twilio" },
  { value: "livekit", label: "LiveKit" },
  { value: "moq", label: "Media over QUIC" },
];

type TransportProps = Pick<
  ConsoleProps,
  | "transportType"
  | "transportFactory"
  | "startBotParams"
  | "startBotResponseTransformer"
>;

const websocketResponseTransformer: NonNullable<
  ConsoleProps["startBotResponseTransformer"]
> = (response) => {
  const { wsUrl, token } = response as unknown as {
    wsUrl: string;
    token?: string;
  };
  return {
    wsUrl: token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl,
  };
};

// Each factory imports its transport lazily, so only the selected one loads.
function getTransportProps(type: TransportType): TransportProps {
  switch (type) {
    case "smallwebrtc":
      return {
        transportType: "smallwebrtc",
        transportFactory: async () => {
          const { SmallWebRTCTransport } = await import(
            "@pipecat-ai/small-webrtc-transport"
          );
          return new SmallWebRTCTransport({ waitForICEGathering: true });
        },
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            createDailyRoom: false,
            enableDefaultIceServers: true,
            transport: "webrtc",
          },
        },
      };
    case "daily":
      return {
        transportType: "daily",
        transportFactory: async () => {
          const { DailyTransport } = await import(
            "@pipecat-ai/daily-transport"
          );
          return new DailyTransport();
        },
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            createDailyRoom: true,
            transport: "daily",
          },
        },
      };
    case "websocket":
      return {
        transportType: "websocket",
        transportFactory: async () => {
          const { WebSocketTransport } = await import(
            "@pipecat-ai/websocket-transport"
          );
          return new WebSocketTransport();
        },
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            transport: "websocket",
          },
        },
        startBotResponseTransformer: websocketResponseTransformer,
      };
    case "twilio":
      return {
        transportType: "websocket",
        transportFactory: async () => {
          const { TwilioSerializer, WebSocketTransport } = await import(
            "@pipecat-ai/websocket-transport"
          );
          return new WebSocketTransport({
            serializer: new TwilioSerializer(),
            recorderSampleRate: 8000,
            playerSampleRate: 8000,
          });
        },
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            transport: "twilio",
          },
        },
        startBotResponseTransformer: websocketResponseTransformer,
      };
    case "livekit":
      return {
        transportType: "livekit",
        transportFactory: async () => {
          const { LiveKitTransport } = await import(
            "@pipecat-ai/livekit-transport"
          );
          return new LiveKitTransport();
        },
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            transport: "livekit",
          },
        },
      };
    case "moq":
      return {
        transportType: "moq",
        transportFactory: async () => {
          const { MoqTransport } = await import("@pipecat-ai/moq-transport");
          // The relay URL arrives with the /start response and overrides this.
          return new MoqTransport({ relayUrl: "" });
        },
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            transport: "moq",
          },
        },
      };
  }
}

const emulateTwilioMessages = (websocketTransport: WebSocketTransport) => {
  const connectedMessage = {
    event: "connected",
    protocol: "Call",
    version: "1.0.0",
  };
  void websocketTransport?.sendRawMessage(connectedMessage);
  const startMessage = {
    event: "start",
    start: {
      streamSid: "mock",
      callSid: "mock",
    },
  };
  void websocketTransport?.sendRawMessage(startMessage);
};

type TransportSelectProps = {
  value: TransportType;
  onValueChange: (value: TransportType) => void;
};

function TransportSelect({ value, onValueChange }: TransportSelectProps) {
  return (
    <Select
      items={TRANSPORT_OPTIONS}
      value={value}
      onValueChange={(next) => onValueChange(next as TransportType)}
    >
      <SelectTrigger aria-label="Transport" size="sm" className="w-32 sm:w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRANSPORT_OPTIONS.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Home() {
  const [transportType, setTransportType] =
    useState<TransportType>("smallwebrtc");
  // Lives outside the keyed Console so switching transports keeps the theme.
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const onClient = (client: PipecatClient) => {
    client.on(RTVIEvent.Connected, () => {
      if (transportType === "twilio") {
        emulateTwilioMessages(client.transport as WebSocketTransport);
      }
    });
    client.on(RTVIEvent.MicUpdated, (mic) => {
      (window as Window & { client?: PipecatClient }).client = client;
      console.log("Mic updated:", mic);
    });
  };

  return (
    <div className="h-dvh">
      <Console
        // transportFactory is read once, so remount when the transport changes.
        key={transportType}
        {...getTransportProps(transportType)}
        titleText="Pipecat Playground"
        noUserVideo
        headerSlot={
          <>
            <TransportSelect
              value={transportType}
              onValueChange={setTransportType}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
          </>
        }
        onClient={onClient}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
