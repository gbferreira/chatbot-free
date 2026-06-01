import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isLidUser,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { logFlow, logFlowError } from "./Logs";

export interface IncomingWhatsAppMessage {
  number: string;
  senderJid: string;
  text: string;
}

export interface WhatsAppServiceOptions {
  onIncomingMessage: (message: IncomingWhatsAppMessage) => Promise<string>;
  authFolder?: string;
  reconnectDelayMs?: number;
}

function extractNumberFromJid(jid: string): string {
  return jid.split("@")[0].split(":")[0];
}

export async function startWhatsAppListener(options: WhatsAppServiceOptions): Promise<void> {
  const authFolder = options.authFolder ?? "auth";
  const reconnectDelayMs = options.reconnectDelayMs ?? 3000;

  const lidToPhone = new Map<string, string>();

  function registerContact(contact: { id: string; lid?: string; phoneNumber?: string }): void {
    if (isLidUser(contact.id) && contact.phoneNumber) {
      lidToPhone.set(
        extractNumberFromJid(contact.id),
        extractNumberFromJid(contact.phoneNumber)
      );
    } else if (!isLidUser(contact.id) && contact.lid) {
      lidToPhone.set(
        extractNumberFromJid(contact.lid),
        extractNumberFromJid(contact.id)
      );
    }
  }

  async function connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    });

    sock.ev.on("connection.update", (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        console.log("Scan the QR code below:");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        console.log("Connected to WhatsApp listener.");
        logFlow("whatsapp", "connection established and ready to receive messages");
      }

      if (connection === "close") {
        const err = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
        const statusCode = err?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logFlow("whatsapp", "connection closed", {
          statusCode,
          reason: statusCode === DisconnectReason.restartRequired ? "restart_required" : statusCode === DisconnectReason.loggedOut ? "logged_out" : "unknown",
          willReconnect: shouldReconnect,
          reconnectDelayMs: shouldReconnect ? reconnectDelayMs : null,
        });

        console.log(
          "WhatsApp connection closed",
          statusCode === DisconnectReason.restartRequired
            ? "(restart required - reconnecting...)"
            : shouldReconnect
              ? "- reconnecting..."
              : ""
        );

        if (shouldReconnect) {
          setTimeout(() => {
            void connect();
          }, reconnectDelayMs);
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messaging-history.set", ({ contacts }) => {
      for (const contact of contacts) {
        registerContact(contact);
      }
      console.log(`[WhatsApp] History sync: ${lidToPhone.size} LID-phone mappings cached`);
    });

    sock.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        registerContact(contact);
      }
    });

    sock.ev.on("contacts.update", (updates) => {
      for (const update of updates) {
        if (update.id) {
          registerContact(update as { id: string; lid?: string; phoneNumber?: string });
        }
      }
    });

    sock.ev.on("lid-mapping.update", ({ lid, pn }) => {
      lidToPhone.set(extractNumberFromJid(lid), extractNumberFromJid(pn));
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg?.message) return;
      if (msg.key.fromMe) return;

      const senderJid = msg.key.remoteJid;
      if (!senderJid) return;

      const text =
        msg.message.conversation ||
        (msg.message.extendedTextMessage as { text?: string } | undefined)?.text ||
        "";
      if (!text.trim()) return;

      let number: string | undefined;

      if (isLidUser(senderJid)) {
        logFlow("whatsapp", "resolving LID sender to phone number", {
          senderJid,
          hasRemoteJidAlt: Boolean(msg.key.remoteJidAlt),
          cachedMappings: lidToPhone.size,
        });

        const alt = msg.key.remoteJidAlt;
        if (alt && !isLidUser(alt)) {
          number = extractNumberFromJid(alt);
          logFlow("whatsapp", "resolved phone from remoteJidAlt", { number });
        }

        if (!number) {
          const cached = lidToPhone.get(extractNumberFromJid(senderJid));
          if (cached) {
            number = cached;
            logFlow("whatsapp", "resolved phone from LID cache", { number });
          }
        }

        if (!number) {
          try {
            const pn = await sock.signalRepository.lidMapping.getPNForLID(senderJid);
            if (pn) {
              number = extractNumberFromJid(pn);
              lidToPhone.set(extractNumberFromJid(senderJid), number);
              logFlow("whatsapp", "resolved phone from signal repository LID mapping", { number });
            }
          } catch {
            logFlow("whatsapp", "signal repository LID mapping not yet populated", { senderJid });
          }
        }

        if (!number) {
          logFlow("whatsapp", "failed to resolve LID to phone, dropping message", {
            senderJid,
            textPreview: text.slice(0, 50),
          });
          console.warn(`[WhatsApp] Could not resolve LID to phone number: ${senderJid}`);
          return;
        }
      } else {
        number = extractNumberFromJid(senderJid);
      }

      logFlow("whatsapp", "incoming message received from user", {
        number,
        senderJid,
        textLength: text.length,
        textPreview: text.slice(0, 80),
        isLid: isLidUser(senderJid),
      });

      try {
        const startMs = Date.now();
        const responseText = await options.onIncomingMessage({
          number,
          senderJid,
          text,
        });
        const elapsedMs = Date.now() - startMs;
        logFlow("whatsapp", "bot response generated", {
          number,
          elapsedMs,
          responseLength: responseText?.length ?? 0,
          responsePreview: responseText?.slice(0, 80) ?? "",
          willSend: Boolean(responseText?.trim()),
        });
        if (responseText?.trim()) {
          await sock.sendMessage(senderJid, { text: responseText });
          logFlow("whatsapp", "response sent back to user", { number, senderJid });
        }
      } catch (error) {
        logFlowError("whatsapp", "failed to process incoming message", error, {
          number,
          senderJid,
          textPreview: text.slice(0, 80),
        });
        console.error("Failed to process incoming WhatsApp message:", error);
        await sock.sendMessage(senderJid, {
          text: "Could not process your message. Please try again.",
        });
      }
    });
  }

  await connect();
}
