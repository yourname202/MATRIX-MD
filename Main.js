require("dotenv").config();
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys");

// -------- ENV --------
const OWNER = process.env.OWNER_NUMBER || "";
const BOT_NAME = process.env.BOT_NAME || "MATRIX-MD";
const GOODBYE_MESSAGE = process.env.GOODBYE_MESSAGE || "Au-revoir";
const BIENVENUE_MESSAGE = process.env.BIENVENUE_MESSAGE || "Bienvenue dans le groupe, s'il-te-pla卯t pr茅sente toi";
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || ".";

// -------- Plugins --------
const plugins = {};
const pluginFolders = [
  "system","admin","owner","image","game","ai","fun","textmaker","download","insu_compl"
];

for (const folder of pluginFolders) {
  const folderPath = path.join(__dirname, "plugins", folder);
  if (!fs.existsSync(folderPath)) continue;

  for (const file of fs.readdirSync(folderPath)) {
    if (!file.endsWith(".js")) continue;
    const plugin = require(`./plugins/${folder}/${file}`);
    if (plugin?.command && typeof plugin.run === "function") {
      plugins[plugin.command.toLowerCase()] = plugin.run;
    }
  }
}

// -------- Session --------
const SESSION_DIR = "./session";
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);

// -------- Start Bot --------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    version,
    printQRInTerminal: false // On g茅n猫re QR code manuellement
  });

  sock.ev.on("creds.update", saveCreds);

  // -------- Connection Update --------
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    // Affichage QR code
    if (qr) {
      console.log("\n馃摫 Scanne ce QR Code avec WhatsApp\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log(`\n鉁� ${BOT_NAME} connect茅 avec succ猫s !`);
      if (OWNER) {
        sock.sendMessage(OWNER, { text: `馃 ${BOT_NAME} est maintenant en ligne.\nTapez ${COMMAND_PREFIX}menu` }).catch(() => {});
      }
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("鉂� Connexion ferm茅e :", reason);

      if (reason !== DisconnectReason.loggedOut) {
        console.log("馃攧 Reconnexion...");
        startBot();
      }
    }
  });

  // -------- Messages --------
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg?.message) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!text.startsWith(COMMAND_PREFIX)) return;

    const args = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    const cmdName = args.shift().toLowerCase();

    let participants = [];
    if (["tagall", "kickall"].includes(cmdName)) {
      try {
        const group = await sock.groupMetadata(msg.key.remoteJid);
        participants = group.participants.map(p => p.id);
      } catch {}
    }

    if (plugins[cmdName]) {
      try {
        await plugins[cmdName](sock, msg, args, participants);
      } catch (err) {
        console.error("鉂� Erreur commande :", err);
        await sock.sendMessage(msg.key.remoteJid, { text: "鉂� Erreur lors de l鈥檈x茅cution de la commande" });
      }
    }

    // -------- Commande menu --------
    if (cmdName === "menu") {
      const menuText = `
馃 ${BOT_NAME} - Menu des commandes

- .help : Liste des commandes
- .info : Infos du bot
- .tagall : Taguer tous les membres
- .kickall : Expulser tous les membres
- .fun : Jeux et blagues
- .ai : Intelligence artificielle
      `;
      await sock.sendMessage(msg.key.remoteJid, { text: menuText });
    }
  });
}

// -------- Lancer le bot --------
startBot();        
