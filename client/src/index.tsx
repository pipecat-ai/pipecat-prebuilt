import {
  ConsoleTemplate,
  FullScreenContainer,
  Select,
  SelectContent,
  SelectGuide,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ThemeProvider,
} from "@pipecat-ai/voice-ui-kit";
import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  TwilioSerializer,
  WebSocketTransport,
} from "@pipecat-ai/websocket-transport";
import type { MoqTransportOptions } from "@pipecat-ai/moq-transport";
import { PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";

type TransportType = "smallwebrtc" | "daily" | "websocket" | "twilio" | "moq";

/**
 * Read a MoQ direct-mode session from the page URL.
 *
 * A bot run with `--moq-direct` is already on the relay before anyone opens
 * this page, so there is no `/start` to ask where to meet it. The runner
 * prints a URL carrying that instead: the relay to dial, the namespace to
 * rendezvous on, and which end of the path pair each side owns.
 *
 * Returns null for a normal `/start` session.
 */
function readMoqDirectOptions(): MoqTransportOptions | null {
  const params = new URLSearchParams(window.location.search);
  const relayUrl = params.get("relay");
  if (!relayUrl) return null;

  const namespace = params.get("ns");
  // The bot publishes its own broadcast as the response and reads the
  // peer's as the request, so we take the opposite pair. Worth naming
  // explicitly: the transport still defaults to the older bot0/client0.
  const botId = params.get("botId") ?? "response";
  const clientId = params.get("clientId") ?? "request";

  // Everyone on this URL shares a namespace, so the session id is what
  // keeps one caller's broadcasts off another's. The runner watches the
  // request prefix and starts a bot per id it sees, which is why we mint
  // it here rather than being told one.
  const session = crypto.randomUUID();
  return {
    relayUrl,
    ...(namespace ? { namespace } : {}),
    botId: `${botId}/${session}`,
    clientId: `${clientId}/${session}`,
  };
}

const TRANSPORT_OPTIONS: { value: TransportType; label: string }[] = [
  { value: "smallwebrtc", label: "SmallWebRTC" },
  { value: "daily", label: "Daily" },
  { value: "websocket", label: "WebSocket" },
  // Twilio is also a websocket transport, just with a special serializer
  { value: "twilio", label: "Twilio" },
  { value: "moq", label: "Media over QUIC" },
];

type TransportProps = Pick<
  React.ComponentProps<typeof ConsoleTemplate>,
  "startBotParams" | "transportOptions" | "startBotResponseTransformer"
>;

const websocketResponseTransformer = (response: unknown) => {
  const { wsUrl, token } = response as { wsUrl: string; token?: string };
  return {
    wsUrl: token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl,
  };
};

function getTransportProps(
  type: TransportType,
): TransportProps {
  switch (type) {
    case "smallwebrtc":
      return {
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            createDailyRoom: false,
            enableDefaultIceServers: true,
            transport: "webrtc",
          },
        },
        transportOptions: {
          waitForICEGathering: true,
        },
      };
    case "daily":
      return {
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
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            transport: "twilio",
          },
        },
        transportOptions: {
          serializer: new TwilioSerializer(),
          recorderSampleRate: 8000,
          playerSampleRate: 8000,
        },
        startBotResponseTransformer: websocketResponseTransformer,
      };
    case "moq": {
      const directOptions = readMoqDirectOptions();
      if (directOptions) {
        // Leaving startBotParams unset is what skips the /start POST: the
        // base connects the transport straight from these options.
        return { transportOptions: directOptions };
      }
      return {
        startBotParams: {
          endpoint: `/start`,
          requestData: {
            transport: "moq",
          },
        },
      };
    }
  }
}

type TransportSelectProps = {
  value: TransportType;
  onValueChange: (value: TransportType) => void;
};

function TransportSelect({ value, onValueChange }: TransportSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as TransportType)}
    >
      <SelectTrigger
        aria-label="Transport"
        className="transport-select-trigger"
        rounded="lg"
        size="md"
      >
        <SelectGuide>Transport</SelectGuide>
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
  // A direct-mode URL names the session to join, so open on that transport
  // instead of making the visitor pick it out of the selector.
  const [transportType, setTransportType] = useState<TransportType>(() =>
    readMoqDirectOptions() ? "moq" : "smallwebrtc",
  );
  const { startBotParams, transportOptions, startBotResponseTransformer } =
    getTransportProps(transportType);

  const emulateTwilioMessages = async (
    websocketTransport: WebSocketTransport,
  ) => {
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

  const onClientConnected = async (pipecatClient: PipecatClient) => {
    if (transportType === "twilio") {
      await emulateTwilioMessages(
        pipecatClient.transport as WebSocketTransport,
      );
    }
  };

  return (
    <ThemeProvider>
      <FullScreenContainer className="items-stretch justify-start">
        <ConsoleTemplate
          key={transportType}
          transportType={
            transportType === "twilio"
              ? "websocket"
              : (transportType as
                  | "smallwebrtc"
                  | "daily"
                  | "websocket"
                  | "moq")
          }
          startBotParams={startBotParams}
          transportOptions={transportOptions}
          startBotResponseTransformer={startBotResponseTransformer}
          noUserVideo={true}
          logoComponent={
            <TransportSelect
              value={transportType}
              onValueChange={setTransportType}
            />
          }
          onClient={(client) => {
            client.on(RTVIEvent.Connected, async () => {
              await onClientConnected(client);
            });
          }}
        />
      </FullScreenContainer>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
