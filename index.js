const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, Events, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Data directory for persistence
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper functions for data persistence
function loadData(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Failed to load ${filename}:`, err);
  }
  return null;
}

function saveData(filename, data) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save ${filename}:`, err);
  }
}

// Load from environment variables first, fall back to config.json safely
let token = process.env.TOKEN;
let staffRoleId = process.env.staffRoleId;
let highStaffRoleId = process.env.highStaffRoleId;

if (process.env.TOKEN) {
  // Running on Railway or similar
  token = process.env.TOKEN;
  staffRoleId = process.env.staffRoleId;
  highStaffRoleId = process.env.highStaffRoleId;
} else {
  // Running locally - try to load config.json safely if it exists
  try {
    const config = require('./config.json');
    token = config.token;
    staffRoleId = config.staffRoleId;
    highStaffRoleId = config.highStaffRoleId;
  } catch (err) {
    console.log('⚠️ קובץ config.json לא נמצא, משתמש רק ב-Environment Variables.');
  }
}


const HELP_CHANNEL_ID = '1551593636947431464';
const XP_CHECK_CHANNEL_ID = '1550593141717860362';
const XP_SHOP_CHANNEL_ID = '1549087934572007514';
const TICKET_SETUP_CHANNEL_ID = '1549087980390580424';
const VETERAN_CHANNEL_ID = '1550593761686589490';
const LOGS_CHANNEL_ID = '1549088024678240339';
const AGE_CHECK_ROLE_ID = '1550600311943462972';
const STAFF_APP_CHANNEL_ID = '1550584433718071447';
const COOLDOWN_DURATION = 30 * 1000;
const XP_PER_MESSAGE = 2;
const XP_PER_VOICE_MINUTE = 4;
const VOICE_XP_INTERVAL = 60000;
const VETERAN_DAYS = 90;

const MANAGEMENT_ROLE_ID = '1549087871321903114';
const SPECIALIST_ROLE_ID = '1550753075717865532';

// Ticket categories
const TICKET_CATEGORIES = [
  { id: 'report_staff', label: 'דיווח על איש צוות', allowedRoles: [staffRoleId, highStaffRoleId] },
  { id: 'complaint_member', label: 'תלונה על ממבר', allowedRoles: [staffRoleId, highStaffRoleId] },
  { id: 'general_question', label: 'שאלה כללית', allowedRoles: [staffRoleId, highStaffRoleId] },
  { id: 'other', label: 'אחר', allowedRoles: [staffRoleId, highStaffRoleId] },
  { id: 'management_appeal', label: 'פנייה להנהלה', allowedRoles: [MANAGEMENT_ROLE_ID] },
];

const SHOP_ROLES = [
  { roleId: '1550807020171431976', cost: 10000 },
  { roleId: '1549087894038388788', cost: 15000 },
  { roleId: '1549087892976963746', cost: 20000 },
  { roleId: '1550806888554303488', cost: 25000 },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages
  ]
});

// Load persistent data from files
let userXPData = loadData('userXP.json') || {};
let openTicketsData = loadData('openTickets.json') || {};
let purchasedRolesData = loadData('purchasedRoles.json') || {};
let userWarningsData = loadData('userWarnings.json') || {};
let activeGiveawaysData = loadData('activeGiveaways.json') || {};

// Runtime maps (session-based, will be repopulated from data)
const helpClaims = new Map();
const cooldowns = new Map();
const voiceSessions = new Map();
const ageCheckClaims = new Map();
const messageTimestamps = new Map();
const userMutes = new Map();
let ticketCategoryId = null;
let autoRoleId = null; // Store the auto-role ID

// Helper functions for persistent data
function getUserXP(userId) {
  return parseInt(userXPData[userId] || 0);
}

function setUserXP(userId, amount) {
  userXPData[userId] = amount;
  saveData('userXP.json', userXPData);
}

function addUserXP(userId, amount) {
  setUserXP(userId, getUserXP(userId) + amount);
}

function getTicketData(channelId) {
  return openTicketsData[channelId];
}

function setTicketData(channelId, data) {
  openTicketsData[channelId] = data;
  saveData('openTickets.json', openTicketsData);
}

function deleteTicketData(channelId) {
  delete openTicketsData[channelId];
  saveData('openTickets.json', openTicketsData);
}

function getWarnings(userId) {
  return userWarningsData[userId] || [];
}

function addWarning(userId, warning) {
  if (!userWarningsData[userId]) {
    userWarningsData[userId] = [];
  }
  userWarningsData[userId].push(warning);
  saveData('userWarnings.json', userWarningsData);
}

function getPurchasedRoles(userId) {
  return purchasedRolesData[userId] || [];
}

function addPurchasedRole(userId, roleId) {
  if (!purchasedRolesData[userId]) {
    purchasedRolesData[userId] = [];
  }
  if (!purchasedRolesData[userId].includes(roleId)) {
    purchasedRolesData[userId].push(roleId);
  }
  saveData('purchasedRoles.json', purchasedRolesData);
}

function removePurchasedRole(userId, roleId) {
  if (purchasedRolesData[userId]) {
    purchasedRolesData[userId] = purchasedRolesData[userId].filter(r => r !== roleId);
    saveData('purchasedRoles.json', purchasedRolesData);
  }
}

const SPAM_THRESHOLD = 5; // 5 messages
const SPAM_TIME_WINDOW = 5000; // in 5 seconds
const MANAGER_ROLE_ID = '1541492934405398535';

// Helper function to check if user has staff permissions (including admins)
function hasStaffPermission(member) {
  return member.roles.cache.has(staffRoleId) || 
         member.roles.cache.has(highStaffRoleId) || 
         member.permissions.has(PermissionFlagsBits.Administrator);
}

// Helper function to send logs
async function sendLog(title, description, color = 0x0099FF) {
  try {
    const logsChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
    if (logsChannel) {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
      await logsChannel.send({ embeds: [embed] });
      console.log(`✅ Log sent: ${title}`);
    } else {
      console.error('Logs channel not found in cache');
    }
  } catch (err) {
    console.error('Failed to send log:', err);
  }
}

// Helper function to handle moderation punishments
async function sendPunishmentDM(user, punishmentType, reason, duration) {
  try {
    const durationText = duration > 0 ? `${duration} דקות` : 'קבוע';
    const titles = {
      'warn': '⚠️ אזהרה',
      'vcmute': '🔇 השתקה בשיחה קולית',
      'chmute': '🔕 השתקה מערוצים'
    };

    const dmEmbed = new EmbedBuilder()
      .setColor(0xFF6B00)
      .setTitle(titles[punishmentType] || 'עונש')
      .addFields(
        { name: 'סיבה', value: reason, inline: false },
        { name: 'משך הזמן', value: durationText, inline: false }
      )
      .setTimestamp();

    await user.send({ embeds: [dmEmbed] });
  } catch (err) {
    console.error('Failed to send punishment DM:', err);
  }
}

// Helper function to end giveaway
async function endGiveaway(giveawayId, guild) {
  const giveaway = activeGiveaways.get(giveawayId);
  if (!giveaway) return;

  try {
    const channel = await guild.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(giveaway.messageId);

    const participants = Array.from(giveaway.participants);
    let winners = [];

    if (participants.length > 0) {
      const winnerCount = Math.min(giveaway.winners, participants.length);
      for (let i = 0; i < winnerCount; i++) {
        const randomIndex = Math.floor(Math.random() * participants.length);
        winners.push(participants[randomIndex]);
        participants.splice(randomIndex, 1);
      }
    }

    const winnersText = winners.length > 0 
      ? winners.map(id => `<@${id}>`).join(', ')
      : 'לא היה זוכה';

    const endEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🎊 הגרלה סיימה!')
      .addFields(
        { name: 'פרס', value: giveaway.prize, inline: false },
        { name: 'זוכים', value: winnersText, inline: false },
        { name: 'סך הכל משתתפים', value: giveaway.participants.size.toString(), inline: true }
      )
      .setTimestamp();

    // Disable button
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_join_${giveawayId}`)
        .setLabel('🎊 הגרלה סיימה')
        .setStyle('Secondary')
        .setDisabled(true)
    );

    await message.edit({
      embeds: [endEmbed],
      components: [disabledRow]
    });

    if (winners.length > 0) {
      await channel.send({
        content: `🎉 **ברכות!** ${winners.map(id => `<@${id}>`).join(', ')} - ניצחתם את ההגרלה על ${giveaway.prize}!`,
        allowedMentions: { parse: ['users'] }
      });
    }

    await sendLog(
      '🎊 הגרלה סיימה',
      `**פרס:** ${giveaway.prize}\n**זוכים:** ${winnersText}\n**סך הכל משתתפים:** ${giveaway.participants.size}`,
      0x00FF00
    );

    activeGiveaways.delete(giveawayId);
  } catch (err) {
    console.error('Failed to end giveaway:', err);
  }
}

client.once(Events.ClientReady, async () => {
  try {
  console.log(`Bot connected as: ${client.user.tag}`);
  
  // Set bot status to DND (Do Not Disturb)
  client.user.setPresence({
    status: 'dnd',
    activities: []
  });
  
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('xpshopsend')
        .setDescription('שלח את ה-XP shop לצאט')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),
      new SlashCommandBuilder()
        .setName('addxp')
        .setDescription('הוסף XP לשחקן')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => 
          option.setName('user')
            .setDescription('בחר משתמש')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('כמות ה-XP להוספה')
            .setRequired(true)
            .setMinValue(1)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('remxp')
        .setDescription('הסר XP משחקן')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => 
          option.setName('user')
            .setDescription('בחר משתמש')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('כמות ה-XP להסרה')
            .setRequired(true)
            .setMinValue(1)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('setautoroll')
        .setDescription('הגדר רול אוטומטי לכל משתמש שנכנס')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('בחר רול')
            .setRequired(true)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('cleartickets')
        .setDescription('מחק את כל הטיקטים וסדר מחדש את הקטגוריה')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),
      new SlashCommandBuilder()
        .setName('warn')
        .setDescription('תן אזהרה לשחקן')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
          option.setName('user')
            .setDescription('בחר משתמש')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('משך הזמן בדקות (0 = קבוע)')
            .setRequired(true)
            .setMinValue(0)
        )
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('סיבת האזהרה')
            .setRequired(true)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('vcmute')
        .setDescription('השתק שחקן בשיחה קולית')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
          option.setName('user')
            .setDescription('בחר משתמש')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('משך הזמן בדקות (0 = קבוע)')
            .setRequired(true)
            .setMinValue(0)
        )
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('סיבת ההשתקה')
            .setRequired(true)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('chmute')
        .setDescription('השתק שחקן מערוצים')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
          option.setName('user')
            .setDescription('בחר משתמש')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('משך הזמן בדקות (0 = קבוע)')
            .setRequired(true)
            .setMinValue(0)
        )
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('סיבת ההשתקה')
            .setRequired(true)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('צור הגרלה')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
          option.setName('prize')
            .setDescription('פרס ההגרלה')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('משך ההגרלה בדקות')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption(option =>
          option.setName('winners')
            .setDescription('מספר הזוכים')
            .setRequired(true)
            .setMinValue(1)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('endgiveaway')
        .setDescription('סיים הגרלה')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
          option.setName('giveaway_id')
            .setDescription('ID של ההגרלה')
            .setRequired(true)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('staffappsend')
        .setDescription('שלח את טופס ההגשה לצוות')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON()
    ];

    await client.application.commands.set(commands);
    console.log('✅ Slash commands registered successfully!');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }

  try {
    const shopChannel = await client.channels.fetch(XP_SHOP_CHANNEL_ID);
    
    if (shopChannel) {
      const messages = await shopChannel.messages.fetch({ limit: 10 });
      for (const message of messages.values()) {
        if (message.author.id === client.user.id) {
          await message.delete().catch(() => {});
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF6B00)
        .setTitle('# TornadoSMP Xp shop');

      let shopText = '**תבחרו את הרול שבא לכם, ותקנו אותו!**\n\n';
      for (let i = 0; i < SHOP_ROLES.length; i++) {
        const roleConfig = SHOP_ROLES[i];
        const roleId = roleConfig.roleId;
        const cost = roleConfig.cost;
        shopText += `${i + 1}. <@&${roleId}> - ${cost} XP\n`;
      }
      shopText += '\n▼ click on the button to buy a role.';
      embed.setDescription(shopText);

      embed.addFields({
        name: '---',
        value: `במידה ויש בעיה בחנות, אתם מוזמנים לפתוח טיקט ב <#${TICKET_SETUP_CHANNEL_ID}>`,
        inline: false
      });

      const buyButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('shop_open_buy')
          .setLabel('Open Store')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('shop_open_refund')
          .setLabel('Return Roles')
          .setStyle('Secondary')
      );

      await shopChannel.send({ embeds: [embed], components: [buyButtonRow] });
      console.log('✅ XP shop sent to channel!');
    }
  } catch (err) {
    console.error('❌ Failed to send shop message:', err);
  }

  try {
    const ticketChannel = await client.channels.fetch(TICKET_SETUP_CHANNEL_ID);
    
    if (ticketChannel) {
      const messages = await ticketChannel.messages.fetch({ limit: 5 });
      for (const message of messages.values()) {
        if (message.author.id === client.user.id && message.embeds.length > 0 && message.embeds[0].title === 'Superme Ticket System') {
          await message.delete().catch(() => {});
        }
      }

      const guild = ticketChannel.guild;
      let category = guild.channels.cache.find(ch => ch.type === ChannelType.GuildCategory && ch.name === '【🏷️】open tickets');
      
      if (!category) {
        category = await guild.channels.create({
          name: '【🏷️】open tickets',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            }
          ]
        });
        console.log('✅ Ticket category created!');
      }

      ticketCategoryId = category.id;

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('TornadoSMP Ticket System')
        .setDescription('בחר קטגוריה כדי לפתוח טיקט');

      const ticketMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('בחר קטגוריה...')
        .addOptions(
          TICKET_CATEGORIES.map(cat => ({
            label: cat.label,
            value: cat.id,
            description: 'פתח טיקט'
          }))
        );

      const row = new ActionRowBuilder().addComponents(ticketMenu);
      await ticketChannel.send({ embeds: [embed], components: [row] });
      console.log('✅ Ticket system sent to channel!');
    }
  } catch (err) {
    console.error('❌ Failed to send ticket system:', err);
  }

  // Send exam message automatically
  try {
    const examChannel = await client.channels.fetch(STAFF_APP_CHANNEL_ID);
    
    if (examChannel) {
      const messages = await examChannel.messages.fetch({ limit: 10 });
      for (const message of messages.values()) {
        if (message.author.id === client.user.id && message.embeds.some(e => e.title?.includes('בחינות'))) {
          await message.delete().catch(() => {});
        }
      }

      const embedExam = new EmbedBuilder()
        .setColor(0x9400D3)
        .setTitle('בחינות לצוות זמינות!')
        .setDescription('**תגישו טופס! ואולי תתקבלו!**')
        .addFields(
          { name: '****תנאי קבלה:****', value: '`1. בגרות ואחראיות מלאה`\n\n`2. גיל 12+`\n\n`3. להיות אחד שבאמת רוצה לקדם את השרת.`', inline: false },
          { name: '\u200B', value: 'אזזז למה אתם מחכים? תתחילו בחינה!', inline: false },
          { name: '\u200B', value: 'כדי להתחיל בחינה יש ללחוץ על הכפתור למטה!', inline: false }
        );

      const examButton = new ButtonBuilder()
        .setCustomId('exam_start')
        .setStyle('Secondary')
        .setEmoji('1522683237825249474');

      const row = new ActionRowBuilder().addComponents(examButton);

      await examChannel.send({
        embeds: [embedExam],
        components: [row]
      });

      console.log('✅ Exam message sent to channel!');
    }
  } catch (err) {
    console.error('❌ Failed to send exam message:', err);
  }
  
  setInterval(() => {
    const now = Date.now();
    voiceSessions.forEach((startTime, userId) => {
      const elapsedMs = now - startTime;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      
      if (elapsedMinutes > 0) {
        const xpToAdd = elapsedMinutes * XP_PER_VOICE_MINUTE;
        const currentXp = getUserXP(userId) || 0;
        setUserXP(userId, currentXp + xpToAdd);
        voiceSessions.set(userId, now);
        console.log(`Added ${xpToAdd} XP to ${userId} for voice activity`);
      }
    });
  }, VOICE_XP_INTERVAL);
  
  } catch (err) {
    console.error('❌ Fatal error in ClientReady:', err);
    process.exit(1);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    console.log(`[InteractionCreate] Type: ${interaction.type}, CustomId: ${interaction.customId || interaction.commandName || 'N/A'}`);
    
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'xpshopsend') {
      try {
        await interaction.deferReply({ ephemeral: true }).catch(err => console.error('Defer error:', err));

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const shopChannel = await client.channels.fetch(XP_SHOP_CHANNEL_ID);
        
        if (shopChannel) {
          const messages = await shopChannel.messages.fetch({ limit: 10 });
          for (const message of messages.values()) {
            if (message.author.id === client.user.id) {
              await message.delete().catch(() => {});
            }
          }

          const embed = new EmbedBuilder()
            .setColor(0xFF6B00)
            .setTitle('# ShadowSMP Xp shop');

          let shopText = '**תבחרו את הרול שבא לכם, ותקנו אותו!**\n\n';
          for (let i = 0; i < SHOP_ROLES.length; i++) {
            const roleConfig = SHOP_ROLES[i];
            const roleId = roleConfig.roleId;
            const cost = roleConfig.cost;
            shopText += `${i + 1}. <@&${roleId}> - ${cost} XP\n`;
          }
          shopText += '\n▼ click on the button to buy a role.';
          embed.setDescription(shopText);

          embed.addFields({
            name: '---',
            value: `במידה ויש בעיה בחנות, אתם מוזמנים לפתוח טיקט ב <#${TICKET_SETUP_CHANNEL_ID}>`,
            inline: false
          });

          const buyButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('shop_open_buy')
              .setLabel('Open Store')
              .setStyle('Primary'),
            new ButtonBuilder()
              .setCustomId('shop_open_refund')
              .setLabel('Return Roles')
              .setStyle('Secondary')
          );

          await shopChannel.send({ embeds: [embed], components: [buyButtonRow] });
          await interaction.editReply({ content: '✅ ה-XP shop נשלח בהצלחה!' });
        }
      } catch (err) {
        console.error('Error in xpshopsend command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'addxp') {
      try {
        await interaction.deferReply({ ephemeral: true }).catch(err => console.error('Defer error:', err));

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
          await interaction.editReply({ content: 'הכמות חייבת להיות חיובית.' });
          return;
        }

        const currentXp = parseInt(userXPData[user.id] || 0);
        userXPData[user.id] = currentXp + amount;
        saveData('userXP.json', userXPData);

        // Log addxp command
        await sendLog(
          '➕ הוספת XP',
          `**משתמש שביצע:** <@${interaction.user.id}>\n**משתמש שקיבל:** <@${user.id}>\n**כמות XP:** ${amount}\n**XP חדש:** ${currentXp + amount}`,
          0x2ECC71
        );

        await interaction.editReply({ content: `✅ נוסף ${amount} XP ל-<@${user.id}>! XP כללי: ${currentXp + amount}` });
      } catch (err) {
        console.error('Error in addxp command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'remxp') {
      try {
        await interaction.deferReply({ ephemeral: true }).catch(err => console.error('Defer error:', err));

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
          await interaction.editReply({ content: 'הכמות חייבת להיות חיובית.' });
          return;
        }

        const currentXp = getUserXP(user.id) || 0;
        const newXp = Math.max(0, currentXp - amount);
        setUserXP(user.id, newXp);

        // Log remxp command
        await sendLog(
          '➖ הסרת XP',
          `**משתמש שביצע:** <@${interaction.user.id}>\n**משתמש שהורד:** <@${user.id}>\n**כמות XP:** ${amount}\n**XP חדש:** ${newXp}`,
          0xE74C3C
        );

        await interaction.editReply({ content: `✅ הוסר ${amount} XP מ-<@${user.id}>! XP כללי: ${newXp}` });
      } catch (err) {
        console.error('Error in remxp command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'setautoroll') {
      try {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const role = interaction.options.getRole('role');
        autoRoleId = role.id;

        // Log auto role set
        await sendLog(
          '⚙️ הגדרת רול אוטומטי',
          `**משתמש שביצע:** <@${interaction.user.id}>\n**רול:** <@&${role.id}>`,
          0x3498DB
        );

        await interaction.editReply({ content: `✅ רול אוטומטי הוגדר ל- <@&${role.id}>! כל משתמש שנכנס יקבל אותו.` });
      } catch (err) {
        console.error('Error in setautoroll command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'cleartickets') {
      try {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const guild = interaction.guild;
        let deletedCount = 0;

        // Delete all ticket channels
        for (const [channelId, ticketData] of Object.entries(openTicketsData)) {
          try {
            const channel = await guild.channels.fetch(channelId);
            if (channel) {
              await channel.delete();
              deletedCount++;
            }
          } catch (err) {
            console.error(`Failed to delete ticket channel ${channelId}:`, err);
          }
        }

        // Delete and recreate the ticket category
        const oldCategory = await guild.channels.fetch(ticketCategoryId).catch(() => null);
        if (oldCategory) {
          try {
            await oldCategory.delete();
            console.log('Old ticket category deleted');
          } catch (err) {
            console.error('Failed to delete old category:', err);
          }
        }

        // Create new category at the top
        try {
          const newCategory = await guild.channels.create({
            name: '【🏷️】open tickets',
            type: ChannelType.GuildCategory,
            position: 0, // Set to top
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
              }
            ]
          });

          ticketCategoryId = newCategory.id;
          openTicketsData = {};
          saveData('openTickets.json', openTicketsData);

          await sendLog(
            '🗑️ מחיקת כל הטיקטים',
            `**משתמש:** <@${interaction.user.id}>\n**טיקטים שנמחקו:** ${deletedCount}\n**קטגוריה חדשה נוצרה בעמדה הגבוהה ביותר**`,
            0xFF0000
          );

          await interaction.editReply({ content: `✅ נמחקו ${deletedCount} טיקטים! הקטגוריה סודרה מחדש בעמדה הגבוהה ביותר.` });
        } catch (err) {
          console.error('Failed to create new category:', err);
          await interaction.editReply({ content: '❌ אירעה שגיאה ביצירת הקטגוריה החדשה.' }).catch(() => {});
        }
      } catch (err) {
        console.error('Error in cleartickets command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'warn') {
      try {
        await interaction.deferReply({ ephemeral: true });

        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (!hasStaffPermission(member)) {
          await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason');

        // Warning is added via addWarning function which handles persistence
        addWarning(targetUser.id, {
          moderator: interaction.user.id,
          reason: reason,
          timestamp: Date.now()
        });

        await sendPunishmentDM(targetUser, 'warn', reason, duration);

        await sendLog(
          '⚠️ אזהרה',
          `**משתמש:** <@${targetUser.id}>\n**סיבה:** ${reason}\n**משך זמן:** ${duration > 0 ? duration + ' דקות' : 'קבוע'}\n**על ידי:** <@${interaction.user.id}>\n**סה"כ אזהרות:** ${getWarnings(targetUser.id).length}`,
          0xFF6B00
        );

        await interaction.editReply({ content: `✅ אזהרה ניתנה ל-<@${targetUser.id}>! (אזהרה #${getWarnings(targetUser.id).length})` });
      } catch (err) {
        console.error('Error in warn command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'vcmute') {
      try {
        await interaction.deferReply({ ephemeral: true });

        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (!hasStaffPermission(member)) {
          await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason');

        // Apply mute
        try {
          await targetMember.voice.setMute(true);
        } catch (err) {
          console.error('Failed to mute user in voice:', err);
        }

        await sendPunishmentDM(targetUser, 'vcmute', reason, duration);

        await sendLog(
          '🔇 השתקה בשיחה קולית',
          `**משתמש:** <@${targetUser.id}>\n**סיבה:** ${reason}\n**משך זמן:** ${duration > 0 ? duration + ' דקות' : 'קבוע'}\n**על ידי:** <@${interaction.user.id}>`,
          0xFF0000
        );

        // Auto-unmute after duration (if duration > 0)
        if (duration > 0) {
          setTimeout(async () => {
            try {
              const member = await interaction.guild.members.fetch(targetUser.id);
              await member.voice.setMute(false);
              console.log(`Unmuted ${targetUser.id} from voice`);

              await sendLog(
                '🔊 ביטול השתקה בשיחה קולית',
                `**משתמש:** <@${targetUser.id}>\n**הסיבה:** פג תוקף המיוט`,
                0x2ECC71
              );
            } catch (err) {
              console.error('Failed to unmute user:', err);
            }
          }, duration * 60 * 1000);
        }

        await interaction.editReply({ content: `✅ <@${targetUser.id}> הושתק בשיחה קולית!` });
      } catch (err) {
        console.error('Error in vcmute command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'chmute') {
      try {
        await interaction.deferReply({ ephemeral: true });

        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (!hasStaffPermission(member)) {
          await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason');

        // Apply timeout (Discord's built-in timeout feature)
        try {
          await targetMember.timeout(duration > 0 ? duration * 60 * 1000 : null, reason);
        } catch (err) {
          console.error('Failed to timeout user:', err);
        }

        await sendPunishmentDM(targetUser, 'chmute', reason, duration);

        await sendLog(
          '🔕 השתקה מערוצים',
          `**משתמש:** <@${targetUser.id}>\n**סיבה:** ${reason}\n**משך זמן:** ${duration > 0 ? duration + ' דקות' : 'קבוע'}\n**על ידי:** <@${interaction.user.id}>`,
          0xFF0000
        );

        await interaction.editReply({ content: `✅ <@${targetUser.id}> הושתק מערוצים!` });
      } catch (err) {
        console.error('Error in chmute command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'giveaway') {
      try {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים ליצור הגרלות.' });
          return;
        }

        const prize = interaction.options.getString('prize');
        const duration = interaction.options.getInteger('duration');
        const winners = interaction.options.getInteger('winners');
        const giveawayId = `giveaway_${Date.now()}`;

        const giveawayEmbed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🎉 הגרלה חדשה!')
          .addFields(
            { name: 'פרס', value: prize, inline: false },
            { name: 'מספר זוכים', value: winners.toString(), inline: true },
            { name: 'משך ההגרלה', value: `${duration} דקות`, inline: true },
            { name: 'לחץ 🎊 כדי להשתתף', value: 'חד פעם בלבד', inline: false }
          )
          .setFooter({ text: `ID: ${giveawayId}` })
          .setTimestamp(Date.now() + duration * 60 * 1000);

        const reactionButton = new ButtonBuilder()
          .setCustomId(`giveaway_join_${giveawayId}`)
          .setLabel('🎊 השתתף')
          .setStyle('Primary');

        const row = new ActionRowBuilder().addComponents(reactionButton);

        const giveawayMessage = await interaction.channel.send({
          embeds: [giveawayEmbed],
          components: [row]
        });

        activeGiveaways.set(giveawayId, {
          messageId: giveawayMessage.id,
          channelId: interaction.channelId,
          prize: prize,
          winners: winners,
          participants: new Set(),
          endTime: Date.now() + duration * 60 * 1000,
          createdBy: interaction.user.id
        });

        await sendLog(
          '🎉 הגרלה חדשה',
          `**פרס:** ${prize}\n**מספר זוכים:** ${winners}\n**משך:** ${duration} דקות\n**יוצר:** <@${interaction.user.id}>`,
          0xFFD700
        );

        await interaction.editReply({ content: `✅ הגרלה יצורה בהצלחה! (ID: ${giveawayId})` });

        // End giveaway after duration
        setTimeout(async () => {
          await endGiveaway(giveawayId, interaction.guild);
        }, duration * 60 * 1000);
      } catch (err) {
        console.error('Error in giveaway command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'endgiveaway') {
      try {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים לסיים הגרלות.' });
          return;
        }

        const giveawayId = interaction.options.getString('giveaway_id');

        if (!activeGiveaways.has(giveawayId)) {
          await interaction.editReply({ content: '❌ הגרלה זו לא קיימת.' });
          return;
        }

        await endGiveaway(giveawayId, interaction.guild);
        await interaction.editReply({ content: `✅ הגרלה ${giveawayId} סיימה!` });
      } catch (err) {
        console.error('Error in endgiveaway command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'staffappsend') {
      try {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const channel = await client.channels.fetch(STAFF_APP_CHANNEL_ID);

        // Delete old messages
        const messages = await channel.messages.fetch({ limit: 10 });
        for (const message of messages.values()) {
          if (message.author.id === client.user.id) {
            await message.delete().catch(() => {});
          }
        }

        const embed = new EmbedBuilder()
          .setColor(0xFF6B00)
          .setTitle('# טפסים לצוות זמינים!')
          .setDescription('**תגישו טופס! ואולי תתקבלו!**')
          .addFields(
            { name: '****תנאי קבלה:****', value: '`1. בגרות ואחראיות מלאה`\n\n`2. גיל 13+`\n\n`3. להיות אחד שבאמת רוצה לקדם את השרת.`', inline: false },
            { name: '\u200B', value: 'אזזז למה אתם מחכים? תתחילו בחינה!', inline: false },
            { name: '\u200B', value: '-# כדי להתחיל בחינה יש ללחוץ על ה <:BetterZonestaffapplication:1522683237825249474> למטה!', inline: false }
          );

        const appButton = new ButtonBuilder()
          .setCustomId('staffapp_start')
          .setLabel('🔵 התחל בחינה')
          .setStyle('Primary');

        const row = new ActionRowBuilder().addComponents(appButton);

        await channel.send({
          embeds: [embed],
          components: [row]
        });

        await interaction.editReply({ content: '✅ טופס הגשה לצוות נשלח בהצלחה!' });
      } catch (err) {
        console.error('Error in staffappsend command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'examsend') {
      return;
    }
  }

  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;

    if (customId === 'ticket_category_select') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const categoryId = interaction.values[0];
      const category = TICKET_CATEGORIES.find(c => c.id === categoryId);
      
      if (!category) {
        await interaction.editReply({ content: 'קטגוריה לא קיימת.' });
        return;
      }

      const guild = interaction.guild;
      const userId = interaction.user.id;
      const member = await guild.members.fetch(userId);
      const username = member.user.username;
      const categoryLabel = category.label;

      // Check if user already has an open ticket
      let userHasOpenTicket = false;
      for (const [channelId, ticketData] of Object.entries(openTicketsData)) {
        if (ticketData.userId === userId) {
          userHasOpenTicket = true;
          await interaction.editReply({ content: `❌ אתה כבר יש לך טיקט פתוח! <#${channelId}>` });
          break;
        }
      }

      if (userHasOpenTicket) return;

      const ticketName = `${categoryLabel}-${username}`;

      try {
        const ticketChannel = await guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: ticketCategoryId,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: userId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
          ],
        });

        for (const roleId of category.allowedRoles) {
          await ticketChannel.permissionOverwrites.create(roleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });
        }

        const staffRole = await guild.roles.fetch(staffRoleId).catch(() => null);
        const highStaffRole = await guild.roles.fetch(highStaffRoleId).catch(() => null);
        
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('טיקט חדש')
          .setDescription(`שלום! בקרוב צוות השרת יקח את פנייתך!`);

        const claimButton = new ButtonBuilder()
          .setCustomId(`ticket_claim_${ticketChannel.id}`)
          .setLabel('Claim')
          .setStyle('Success');

        const addButton = new ButtonBuilder()
          .setCustomId(`ticket_add_user_${ticketChannel.id}`)
          .setLabel('הוספת שחקן')
          .setStyle('Primary');

        const removeButton = new ButtonBuilder()
          .setCustomId(`ticket_remove_user_${ticketChannel.id}`)
          .setLabel('הסרת שחקן')
          .setStyle('Danger');

        const closeButton = new ButtonBuilder()
          .setCustomId(`ticket_close_${ticketChannel.id}`)
          .setLabel('סגור טיקט')
          .setStyle('Danger');

        const row = new ActionRowBuilder().addComponents(claimButton, addButton, removeButton, closeButton);

        let mentionText = '';
        if (staffRole) mentionText += `${staffRole} `;
        if (highStaffRole) mentionText += `${highStaffRole} `;
        mentionText += `<@${userId}>`;

        await ticketChannel.send({ 
          embeds: [embed], 
          components: [row], 
          content: mentionText,
          allowedMentions: { parse: ['users', 'roles'], repliedUser: false }
        });

        setTicketData(ticketChannel.id, {
          userId: userId,
          channelId: ticketChannel.id,
          claimed: false,
          claimedBy: null,
          participants: [userId],
          category: categoryId
        });

        await interaction.editReply({ content: `✅ טיקט נוצר בהצלחה! <#${ticketChannel.id}>` });
        
        // Log ticket creation
        await sendLog(
          '🎫 טיקט חדש נוצר',
          `**משתמש:** <@${userId}>\n**קטגוריה:** ${categoryLabel}\n**שם הטיקט:** ${ticketName}\n**ערוץ:** <#${ticketChannel.id}>`,
          0x0099FF
        );
      } catch (err) {
        console.error('Failed to create ticket:', err);
        await interaction.editReply({ content: '❌ אירעה שגיאה ביצירת הטיקט.' }).catch(() => {});
      }
      return;
    }

    if (customId === 'shop_buy_menu') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const roleId = interaction.values[0];
      const userId = interaction.user.id;
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      
      if (!member) {
        await interaction.editReply({ content: 'לא הצלחתי למצוא אותך בשרת.' });
        return;
      }

      const roleConfig = SHOP_ROLES.find(r => r.roleId === roleId);
      if (!roleConfig) {
        await interaction.editReply({ content: 'הרול הזה לא קיים בחנות.' });
        return;
      }

      const userXpAmount = getUserXP(userId) || 0;
      if (userXpAmount < roleConfig.cost) {
        await interaction.editReply({ content: `❌ אין לך מספיק אקספי! אתה צריך ${roleConfig.cost} אקספי וברשותך ${userXpAmount}.` });
        return;
      }

      if (member.roles.cache.has(roleId)) {
        await interaction.editReply({ content: '❌ אתה כבר בעלים של הרול הזה!' });
        return;
      }

      try {
        await member.roles.add(roleId);
        setUserXP(userId, userXpAmount - roleConfig.cost);
        
        if (!getPurchasedRoles(userId).includes(roleId)) {
          addPurchasedRole(userId, roleId);
        }

        await interaction.editReply({ content: `✅ קנית בהצלחה את הרול <@&${roleId}>! הוחסרו ${roleConfig.cost} אקספי. XP שנותר: ${userXpAmount - roleConfig.cost}` });
      } catch (err) {
        console.error('Failed to purchase role:', err);
        await interaction.editReply({ content: '❌ אירעה שגיאה בעת קנייה של הרול.' }).catch(() => {});
      }
      return;
    }

    if (customId === 'shop_refund_menu') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const roleId = interaction.values[0];
      const userId = interaction.user.id;
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      
      if (!member) {
        await interaction.editReply({ content: 'לא הצלחתי למצוא אותך בשרת.' });
        return;
      }

      const roleConfig = SHOP_ROLES.find(r => r.roleId === roleId);
      if (!roleConfig) {
        await interaction.editReply({ content: 'הרול הזה לא קיים בחנות.' });
        return;
      }

      if (!member.roles.cache.has(roleId)) {
        await interaction.editReply({ content: '❌ אתה לא בעלים של הרול הזה!' });
        return;
      }

      try {
        await member.roles.remove(roleId);
        
        const userXpAmount = getUserXP(userId) || 0;
        setUserXP(userId, userXpAmount + roleConfig.cost);
        
        if (getPurchasedRoles(userId).includes(roleId)) {
          removePurchasedRole(userId, roleId);
        }

        await interaction.editReply({ content: `✅ החזרת בהצלחה את הרול <@&${roleId}>! קיבלת חזרה ${roleConfig.cost} אקספי. XP כללי: ${userXpAmount + roleConfig.cost}` });
      } catch (err) {
        console.error('Failed to refund role:', err);
        await interaction.editReply({ content: '❌ אירעה שגיאה בעת החזרת הרול.' }).catch(() => {});
      }
      return;
    }
  }

  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  const customId = interaction.customId;

  // Ticket buttons
  if (customId.startsWith('ticket_claim_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_claim_', '');
    const ticketData = getTicketData(channelId);

    if (!ticketData) {
      await interaction.editReply({ content: 'הטיקט לא קיים עוד.' });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!hasStaffPermission(member)) {
      await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים ללחוץ על כפתור זה!' });
      return;
    }

    if (ticketData.claimed) {
      await interaction.editReply({ content: `הטיקט כבר נטויל על ידי <@${ticketData.claimedBy}>.` });
      return;
    }

    ticketData.claimed = true;
    ticketData.claimedBy = interaction.user.id;

    const channel = client.channels.cache.get(channelId);
    if (channel) {
      try {
        const messages = await channel.messages.fetch({ limit: 1 });
        const message = messages.first();
        if (message && message.components.length > 0) {
          const newButton = new ButtonBuilder()
            .setCustomId(`ticket_claim_${channelId}`)
            .setLabel(`נטויל על ידי ${interaction.user.username}`)
            .setStyle('Secondary')
            .setDisabled(true);

          const addButton = new ButtonBuilder()
            .setCustomId(`ticket_add_user_${channelId}`)
            .setLabel('הוספת שחקן')
            .setStyle('Primary');

          const removeButton = new ButtonBuilder()
            .setCustomId(`ticket_remove_user_${channelId}`)
            .setLabel('הסרת שחקן')
            .setStyle('Danger');

          const closeButton = new ButtonBuilder()
            .setCustomId(`ticket_close_${channelId}`)
            .setLabel('סגור טיקט')
            .setStyle('Danger');

          const newRow = new ActionRowBuilder().addComponents(newButton, addButton, removeButton, closeButton);
          await message.edit({ components: [newRow] });
        }
      } catch (err) {
        console.error('Failed to update ticket:', err);
      }
    }

    await interaction.editReply({ content: `✅ טיקט נטויל בהצלחה!` });
    
    // Log ticket claim
    await sendLog(
      '🎯 טיקט נטויל',
      `**נטויל על ידי:** <@${interaction.user.id}>\n**טיקט:** <#${channelId}>`,
      0xFFFF00
    );
    return;
  }

  // Exam claim button
  if (customId.startsWith('exam_claim_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('exam_claim_', '');
    const ticketData = getTicketData(channelId);

    if (!ticketData) {
      await interaction.editReply({ content: 'הבחינה לא קיימת עוד.' });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasSpecialistRole = member.roles.cache.has(SPECIALIST_ROLE_ID);

    if (!hasSpecialistRole) {
      await interaction.editReply({ content: 'רק רול Specialist יכול לטפל בבחינות!' });
      return;
    }

    if (ticketData.claimed) {
      await interaction.editReply({ content: `הבחינה כבר נטויל על ידי <@${ticketData.claimedBy}>.` });
      return;
    }

    ticketData.claimed = true;
    ticketData.claimedBy = interaction.user.id;

    const channel = client.channels.cache.get(channelId);
    if (channel) {
      try {
        const messages = await channel.messages.fetch({ limit: 1 });
        const message = messages.first();
        if (message && message.components.length > 0) {
          const newClaimButton = new ButtonBuilder()
            .setCustomId(`exam_claim_${channelId}`)
            .setLabel(`נטויל על ידי ${interaction.user.username}`)
            .setStyle('Secondary')
            .setDisabled(true);

          const closeButton = new ButtonBuilder()
            .setCustomId(`exam_close_${channelId}`)
            .setLabel('סגור בחינה')
            .setStyle('Danger');

          const newRow = new ActionRowBuilder().addComponents(newClaimButton, closeButton);
          await message.edit({ components: [newRow] });
        }
      } catch (err) {
        console.error('Failed to update exam:', err);
      }
    }

    await interaction.editReply({ content: `✅ בחינה נטויל בהצלחה!` });
    
    // Log exam claim
    await sendLog(
      '🧪 בחינה נטויל',
      `**נטויל על ידי:** <@${interaction.user.id}>\n**בחינה:** <#${channelId}>`,
      0x9400D3
    );
    return;
  }

  if (customId.startsWith('ticket_add_user_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_add_user_', '');
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!hasStaffPermission(member)) {
      await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים להשתמש בכפתור הזה!' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`ticket_add_modal_${channelId}`)
      .setTitle('הוספת שחקן לטיקט')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('user_input')
            .setLabel('Username או ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('ticket_remove_user_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_remove_user_', '');
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!hasStaffPermission(member)) {
      await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים להשתמש בכפתור הזה!' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`ticket_remove_modal_${channelId}`)
      .setTitle('הסרת שחקן מהטיקט')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('user_input')
            .setLabel('Username או ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('ticket_close_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_close_', '');
    const channel = client.channels.cache.get(channelId);
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!hasStaffPermission(member)) {
      await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים לסגור טיקט!' });
      return;
    }

    try {
      await interaction.editReply({ content: '✅ טיקט נסגר בהצלחה! הערוץ יימחק בעוד 5 שניות...' });
      
      setTimeout(async () => {
        try {
          await channel.delete();
          const ticketData = getTicketData(channelId);
          if (ticketData) {
            deleteTicketData(channelId);
          }
          console.log(`✅ Ticket ${channelId} closed and deleted`);
          
          // Log ticket closed
          await sendLog(
            '🔒 טיקט סגור',
            `**סגור על ידי:** <@${interaction.user.id}>\n**ID:** ${channelId}`,
            0xFF6600
          );
        } catch (err) {
          console.error('Failed to delete ticket channel:', err);
        }
      }, 5000);
    } catch (err) {
      console.error('Failed to close ticket:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בעת סגירת הטיקט.' }).catch(() => {});
    }
    return;
  }

  // Exam close button
  if (customId.startsWith('exam_close_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('exam_close_', '');
    const channel = client.channels.cache.get(channelId);
    const ticketData = getTicketData(channelId);

    if (!ticketData) {
      await interaction.editReply({ content: '❌ לא נמצאה בחינה זו.' });
      return;
    }

    // Only the person who created the exam or Specialist can close it
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isCreator = ticketData.createdBy === interaction.user.id;
    const hasSpecialist = member.roles.cache.has(SPECIALIST_ROLE_ID);

    if (!isCreator && !hasSpecialist) {
      await interaction.editReply({ content: '❌ רק הנבחן או Specialist יכולים לסגור בחינה!' });
      return;
    }

    try {
      await interaction.editReply({ content: '✅ בחינה סגורה בהצלחה! הערוץ יימחק בעוד 5 שניות...' });
      
      setTimeout(async () => {
        try {
          await channel.delete();
          deleteTicketData(channelId);
          console.log(`✅ Exam ${channelId} closed and deleted`);
          
          // Log exam closed
          await sendLog(
            '🧪 בחינה סגורה',
            `**סגור על ידי:** <@${interaction.user.id}>\n**נבחן:** <@${ticketData.createdBy}>\n**ID:** ${channelId}`,
            0x9400D3
          );
        } catch (err) {
          console.error('Failed to delete exam channel:', err);
        }
      }, 5000);
    } catch (err) {
      console.error('Failed to close exam:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בעת סגירת הבחינה.' }).catch(() => {});
    }
    return;
  }

  // Modal submissions for tickets
  if (customId.startsWith('ticket_add_modal_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_add_modal_', '');
    const userInput = interaction.fields.getTextInputValue('user_input');
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
      await interaction.editReply({ content: '❌ הערוץ לא קיים.' });
      return;
    }

    try {
      let member = null;
      const guild = channel.guild;

      try {
        member = await guild.members.fetch(userInput);
      } catch (e) {
        const members = await guild.members.search({ query: userInput, limit: 1 });
        if (members.size > 0) {
          member = members.first();
        }
      }

      if (!member) {
        await interaction.editReply({ content: '❌ לא מצאתי את המשתמש הזה.' });
        return;
      }

      await channel.permissionOverwrites.create(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      const ticketData = getTicketData(channelId);
      if (ticketData) {
        ticketData.participants.push(member.id);
      }

      await interaction.editReply({ content: `✅ <@${member.id}> נוסף לטיקט בהצלחה!` });
    } catch (err) {
      console.error('Failed to add user:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בהוספת המשתמש.' }).catch(() => {});
    }
    
    // Log user added to ticket
    await sendLog(
      '➕ משתמש נוסף לטיקט',
      `**משתמש:** <@${member.id}>\n**נוסף על ידי:** <@${interaction.user.id}>\n**טיקט:** <#${channelId}>`,
      0x00FF00
    );
    return;
  }

  if (customId.startsWith('ticket_remove_modal_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_remove_modal_', '');
    const userInput = interaction.fields.getTextInputValue('user_input');
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
      await interaction.editReply({ content: '❌ הערוץ לא קיים.' });
      return;
    }

    try {
      let member = null;
      const guild = channel.guild;

      try {
        member = await guild.members.fetch(userInput);
      } catch (e) {
        const members = await guild.members.search({ query: userInput, limit: 1 });
        if (members.size > 0) {
          member = members.first();
        }
      }

      if (!member) {
        await interaction.editReply({ content: '❌ לא מצאתי את המשתמש הזה.' });
        return;
      }

      await channel.permissionOverwrites.delete(member.id);

      const ticketData = getTicketData(channelId);
      if (ticketData) {
        ticketData.participants = ticketData.participants.filter(id => id !== member.id);
      }

      await interaction.editReply({ content: `✅ <@${member.id}> הוסר מהטיקט בהצלחה!` });
    } catch (err) {
      console.error('Failed to remove user:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בהסרת המשתמש.' }).catch(() => {});
    }
    
    // Log user removed from ticket
    await sendLog(
      '➖ משתמש הוסר מטיקט',
      `**משתמש:** <@${member.id}>\n**הוסר על ידי:** <@${interaction.user.id}>\n**טיקט:** <#${channelId}>`,
      0xFF0000
    );
    return;
  }

  // Staff application submission
  if (customId === 'staffapp_modal') {
    try {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const name = interaction.fields.getTextInputValue('staffapp_name');
      const age = interaction.fields.getTextInputValue('staffapp_age');
      const experience = interaction.fields.getTextInputValue('staffapp_experience');
      const why = interaction.fields.getTextInputValue('staffapp_why');
      const availability = interaction.fields.getTextInputValue('staffapp_availability');

      const appEmbed = new EmbedBuilder()
        .setColor(0xFF6B00)
        .setTitle('📋 בקשה חדשה לצוות')
        .addFields(
          { name: 'שם', value: name, inline: false },
          { name: 'גיל', value: age, inline: true },
          { name: 'זמינות יומית', value: availability, inline: true },
          { name: 'ניסיון', value: experience, inline: false },
          { name: 'למה אתה רוצה להיות צוות?', value: why, inline: false },
          { name: 'משתמש', value: `<@${interaction.user.id}>`, inline: false }
        )
        .setFooter({ text: `ID: ${interaction.user.id}` })
        .setTimestamp();

      const approveButton = new ButtonBuilder()
        .setCustomId(`staffapp_approve_${interaction.user.id}`)
        .setLabel('✅ אישור')
        .setStyle('Success');

      const rejectButton = new ButtonBuilder()
        .setCustomId(`staffapp_reject_${interaction.user.id}`)
        .setLabel('❌ דחייה')
        .setStyle('Danger');

      const row = new ActionRowBuilder().addComponents(approveButton, rejectButton);

      // Send to logs channel
      const logsChannel = await client.channels.fetch(LOGS_CHANNEL_ID);
      await logsChannel.send({
        embeds: [appEmbed],
        components: [row]
      });

      await sendLog(
        '📋 בקשה חדשה לצוות',
        `**משתמש:** <@${interaction.user.id}>\n**שם:** ${name}\n**גיל:** ${age}\n**זמינות:** ${availability}`,
        0xFF6B00
      );

      await interaction.editReply({ content: '✅ הטופס נשלח בהצלחה! המנהלים יבדקו את הבקשה שלך.' }).catch(() => {});
    } catch (err) {
      console.error('Error in staffapp submission:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בעת שליחת הטופס.' }).catch(() => {});
    }
    return;
  }

  // Shop button interactions
  if (customId === 'shop_open_buy') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const buyMenu = new StringSelectMenuBuilder()
      .setCustomId('shop_buy_menu')
      .setPlaceholder('בחר רול לקנייה...')
      .addOptions(
        SHOP_ROLES.map((roleConfig, index) => ({
          label: `Role ${index + 1}`,
          value: roleConfig.roleId,
          description: `${roleConfig.cost} XP`
        }))
      );

    const row = new ActionRowBuilder().addComponents(buyMenu);
    await interaction.editReply({ content: '**בחר רול לקנייה:**', components: [row] });
    return;
  }

  if (customId === 'shop_open_refund') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const refundMenu = new StringSelectMenuBuilder()
      .setCustomId('shop_refund_menu')
      .setPlaceholder('בחר רול להחזרה...')
      .addOptions(
        SHOP_ROLES.map((roleConfig, index) => ({
          label: `Role ${index + 1}`,
          value: roleConfig.roleId,
          description: `Get ${roleConfig.cost} XP back`
        }))
      );

    const row = new ActionRowBuilder().addComponents(refundMenu);
    await interaction.editReply({ content: '**בחר רול להחזרה:**', components: [row] });
    return;
  }


  // Giveaway join button
  if (customId.startsWith('giveaway_join_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const giveawayId = customId.replace('giveaway_join_', '');
    const giveaway = activeGiveaways.get(giveawayId);

    if (!giveaway) {
      await interaction.editReply({ content: '❌ הגרלה זו לא קיימת או סיימה.' }).catch(() => {});
      return;
    }

    if (giveaway.participants.has(interaction.user.id)) {
      await interaction.editReply({ content: '❌ אתה כבר במשתתפים!' }).catch(() => {});
      return;
    }

    giveaway.participants.add(interaction.user.id);

    await interaction.editReply({ content: `✅ נוספת להגרלה! (${giveaway.participants.size} משתתפים)` }).catch(() => {});
    return;
  }

  // Staff application approve
  if (customId.startsWith('staffapp_approve_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    try {
      const userId = customId.replace('staffapp_approve_', '');
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      // Only staff, high staff, and admins can approve
      if (!hasStaffPermission(member)) {
        await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים לאשר בקשות!' });
        return;
      }

      // Get the applicant
      const applicant = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!applicant) {
        await interaction.editReply({ content: '❌ לא ניתן למצוא את המשתמש.' });
        return;
      }

      // Give staff role
      await applicant.roles.add(staffRoleId).catch((err) => {
        console.error('Failed to add staff role:', err);
      });

      // Send DM to applicant
      try {
        await applicant.user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle('✅ בקשתך לצוות אושרה!')
              .setDescription(`ברוכים הבאים לצוות Superme!\nתקבלת את ה Staff Role.`)
              .setTimestamp()
          ]
        });
      } catch (err) {
        console.log('Could not send DM to applicant');
      }

      // Disable the buttons
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staffapp_approve_${userId}`)
          .setLabel('✅ אישור')
          .setStyle('Success')
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`staffapp_reject_${userId}`)
          .setLabel('❌ דחייה')
          .setStyle('Danger')
          .setDisabled(true)
      );

      // Update the message
      await interaction.message.edit({ components: [updatedRow] }).catch(() => {});

      // Log the approval
      await sendLog(
        '✅ בקשת צוות אושרה',
        `**משתמש:** <@${userId}>\n**אושר על ידי:** <@${interaction.user.id}>`,
        0x00FF00
      );

      await interaction.editReply({ content: `✅ בקשת צוות של <@${userId}> אושרה בהצלחה!` });
    } catch (err) {
      console.error('Error in staffapp approval:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בעת אישור הבקשה.' });
    }
    return;
  }

  // Staff application reject
  if (customId.startsWith('staffapp_reject_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    try {
      const userId = customId.replace('staffapp_reject_', '');
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      // Only staff, high staff, and admins can reject
      if (!hasStaffPermission(member)) {
        await interaction.editReply({ content: 'רק Staff, High Staff ו-Administrators יכולים לדחות בקשות!' });
        return;
      }

      // Get the applicant
      const applicant = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!applicant) {
        await interaction.editReply({ content: '❌ לא ניתן למצוא את המשתמש.' });
        return;
      }

      // Send DM to applicant
      try {
        await applicant.user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('❌ בקשתך לצוות נדחתה')
              .setDescription(`קבלנו את הבקשה שלך, אך, לאחר בדיקה, החלטנו לא לקבל אותך לצוות בשלב זה.\nתוכל להגיש בקשה חדשה בעתיד.`)
              .setTimestamp()
          ]
        });
      } catch (err) {
        console.log('Could not send DM to applicant');
      }

      // Disable the buttons
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staffapp_approve_${userId}`)
          .setLabel('✅ אישור')
          .setStyle('Success')
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`staffapp_reject_${userId}`)
          .setLabel('❌ דחייה')
          .setStyle('Danger')
          .setDisabled(true)
      );

      // Update the message
      await interaction.message.edit({ components: [updatedRow] }).catch(() => {});

      // Log the rejection
      await sendLog(
        '❌ בקשת צוות נדחתה',
        `**משתמש:** <@${userId}>\n**נדחה על ידי:** <@${interaction.user.id}>`,
        0xFF0000
      );

      await interaction.editReply({ content: `❌ בקשת צוות של <@${userId}> נדחתה.` });
    } catch (err) {
      console.error('Error in staffapp rejection:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בעת דחיית הבקשה.' });
    }
    return;
  }

  // Staff application start
  if (customId === 'staffapp_start') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const modal = new ModalBuilder()
      .setCustomId('staffapp_modal')
      .setTitle('טופס הגשה לצוות');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('staffapp_name')
          .setLabel('איך קוראים לך?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('staffapp_age')
          .setLabel('בן כמה אתה?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('staffapp_experience')
          .setLabel('מה הניסיון שלך כצוות?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('staffapp_why')
          .setLabel('למה אתה רוצה להיות צוות?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('staffapp_availability')
          .setLabel('כמה שעות ביום אתה יכול להיות פעיל?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // Exam start button
  if (customId === 'exam_start') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    try {
      // Check if user already has an open exam ticket
      const existingTicket = Object.values(openTicketsData).find(
        ticket => ticket.createdBy === interaction.user.id && ticket.category === 'staff_exam'
      );

      if (existingTicket) {
        const ticketChannel = client.channels.cache.get(existingTicket.channelId);
        if (ticketChannel) {
          await interaction.editReply({ content: `✅ כבר יש לך בחינה פתוחה: <#${existingTicket.channelId}>` });
          return;
        }
      }

      // Get or create exam category
      const guild = interaction.guild;
      let examCategoryId = null;
      
      let examCategory = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && c.name === '🧪 בחינות לצוות'
      );

      if (!examCategory) {
        console.log('Creating new exam category...');
        examCategory = await guild.channels.create({
          name: '🧪 בחינות לצוות',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: []
            }
          ]
        });
        console.log('✅ Exam category created:', examCategory.id);
      } else {
        console.log('✅ Found existing exam category:', examCategory.id);
      }

      examCategoryId = examCategory.id;

      // Create exam ticket channel
      const ticketChannel = await guild.channels.create({
        name: `exam-${interaction.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: examCategoryId,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ['ViewChannel']
          },
          {
            id: interaction.user.id,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          },
          {
            id: SPECIALIST_ROLE_ID,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          }
        ]
      });

      // Create ticket info embed
      const examEmbed = new EmbedBuilder()
        .setColor(0x9400D3)
        .setTitle('🧪 בחינה לצוות')
        .setDescription(`**בחינה של:** <@${interaction.user.id}>`)
        .addFields(
          { name: 'הוראות:', value: 'בחינה זו פתוחה לצוות. לחץ על "טיפול בחינה" כדי להתחיל לטפל בבחינה.', inline: false }
        )
        .setTimestamp();

      const claimButton = new ButtonBuilder()
        .setCustomId(`exam_claim_${ticketChannel.id}`)
        .setLabel('טיפול בחינה')
        .setStyle('Primary');

      const closeButton = new ButtonBuilder()
        .setCustomId(`exam_close_${ticketChannel.id}`)
        .setLabel('סגור בחינה')
        .setStyle('Danger');

      const row = new ActionRowBuilder().addComponents(claimButton, closeButton);

      await ticketChannel.send({
        embeds: [examEmbed],
        components: [row]
      });

      // Store ticket info
      const ticketData = {
        channelId: ticketChannel.id,
        createdBy: interaction.user.id,
        category: 'staff_exam',
        createdAt: Date.now(),
        claimed: false
      };
      setTicketData(ticketChannel.id, ticketData);

      await interaction.editReply({ content: `✅ בחינה נפתחה בהצלחה ב <#${ticketChannel.id}>` });

      // Log
      await sendLog(
        '🧪 בחינה נפתחה',
        `**משתמש:** <@${interaction.user.id}>\n**ערוץ:** <#${ticketChannel.id}>`,
        0x9400D3
      );
    } catch (err) {
      console.error('Error in exam_start:', err);
      await interaction.editReply({ content: `❌ אירעה שגיאה בעת פתיחת הבחינה: ${err.message}` });
    }
    return;
  }

  // Help system
  if (customId.startsWith('help_claim_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const messageKey = customId.replace('help_claim_', '');
    const claimData = helpClaims.get(messageKey);

    if (!claimData) {
      await interaction.editReply({ content: 'תבנית המساعדה הזו כבר איננה פעילה.' });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!hasStaffPermission(member)) {
      await interaction.editReply({ content: 'אין לך גישה מתאימה.' });
      return;
    }

    if (claimData.claimed) {
      await interaction.editReply({ content: `בקשה זו כבר מטופלת על ידי <@${claimData.claimedBy}>.` });
      return;
    }

    claimData.claimed = true;
    claimData.claimedBy = interaction.user.id;

    const channel = client.channels.cache.get(claimData.channelId);
    if (channel) {
      try {
        const message = await channel.messages.fetch(claimData.messageId);
        
        const newButton = new ButtonBuilder()
          .setCustomId(`help_claim_${claimData.messageId}`)
          .setLabel(`מטופלת על ידי ${interaction.user.username}`)
          .setStyle('Secondary')
          .setDisabled(true);
        
        const newRow = new ActionRowBuilder().addComponents(newButton);
        await message.edit({ components: [newRow] });
      } catch (err) {
        console.error('Failed to update claim button:', err);
      }
    }

    await interaction.editReply({ content: `מטופלת את בקשת העזרה מ-<@${claimData.userId}>.` });
    return;
  }

  // Age check claim
  if (customId.startsWith('age_check_claim_')) {
    try {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
    } catch (err) {
      console.error('Failed to defer:', err);
      return;
    }
    
    const messageKey = customId.replace('age_check_claim_', '');
    const claimData = ageCheckClaims.get(messageKey);

    if (!claimData) {
      await interaction.editReply({ content: 'בחינה זו כבר סיימה.' }).catch(() => {});
      return;
    }

    if (claimData.claimed) {
      await interaction.editReply({ content: `בחינה זו כבר טופלה על ידי <@${claimData.claimedBy}>.` }).catch(() => {});
      return;
    }

    claimData.claimed = true;
    claimData.claimedBy = interaction.user.id;

    // Log age check claim
    await sendLog(
      '✅ בחינת 16+ טופלה',
      `**טופלה על ידי:** <@${interaction.user.id}>\n**בחינה של:** <@${claimData.originalUserId}>`,
      0xFF6B00
    );

    await interaction.editReply({ content: `✅ בחינה טופלה! ההודעה נמחקה.` }).catch(() => {});
    
    // Delete DM in background - delete for all members who received it
    setTimeout(async () => {
      for (const [key, data] of ageCheckClaims.entries()) {
        if (key === messageKey && data.dmMessageId) {
          try {
            const member = await interaction.guild.members.fetch(data.memberId);
            const dmChannel = await member.createDM();
            const msgs = await dmChannel.messages.fetch({ limit: 20 });
            for (const msg of msgs.values()) {
              if (msg.id === data.dmMessageId) {
                await msg.delete().catch(() => {});
              }
            }
          } catch (err) {
            console.error('Failed to delete DM:', err);
          }
        }
      }
      ageCheckClaims.delete(messageKey);
    }, 500);
    
    return;
  }
  } catch (err) {
    console.error('[InteractionCreate] Fatal error:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'אירעה שגיאה בעיבוד הבקשה.', ephemeral: true }).catch(() => {});
      } else if (interaction.deferred) {
        await interaction.editReply({ content: 'אירעה שגיאה בעיבוד הבקשה.' }).catch(() => {});
      }
    } catch (replyErr) {
      console.error('[InteractionCreate] Failed to send error message:', replyErr);
    }
  }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (newMessage.author.bot) return;
  
  if (oldMessage.content === newMessage.content) return; // No actual change
  
  // Log message edit
  await sendLog(
    '✏️ הודעה נערכה',
    `**משתמש:** <@${newMessage.author.id}>\n**ערוץ:** <#${newMessage.channelId}>\n**תוכן ישן:** ${oldMessage.content.substring(0, 80)}${oldMessage.content.length > 80 ? '...' : ''}\n**תוכן חדש:** ${newMessage.content.substring(0, 80)}${newMessage.content.length > 80 ? '...' : ''}`,
    0xF39C12
  );
});

client.on(Events.MessageDelete, async message => {
  if (message.author.bot) return;
  
  // Log message deletion
  await sendLog(
    '🗑️ הודעה נמחקה',
    `**משתמש:** <@${message.author.id}>\n**ערוץ:** <#${message.channelId}>\n**תוכן:** ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
    0xE74C3C
  );
});

client.on(Events.GuildMemberAdd, async member => {
  // Log member joined
  await sendLog(
    '✅ משתמש הצטרף לשרת',
    `**משתמש:** <@${member.id}>\n**שם:** ${member.user.username}`,
    0x2ECC71
  );

  // Auto-role assignment
  if (autoRoleId) {
    try {
      const role = await member.guild.roles.fetch(autoRoleId);
      if (role) {
        await member.roles.add(role);
        console.log(`✅ Assigned auto-role ${role.name} to ${member.user.username}`);
        
        await sendLog(
          '🎯 רול אוטומטי הוקצה',
          `**משתמש:** <@${member.id}>\n**רול:** <@&${role.id}>`,
          0x1ABC9C
        );
      }
    } catch (err) {
      console.error('Failed to assign auto-role:', err);
    }
  }
});

client.on(Events.GuildMemberRemove, async member => {
  // Log member left
  await sendLog(
    '❌ משתמש עזב את השרת',
    `**משתמש:** ${member.user.username} (${member.id})`,
    0xE74C3C
  );
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const userId = newState.id;

  if (!oldState.channel && newState.channel) {
    voiceSessions.set(userId, Date.now());
    console.log(`${userId} joined voice channel`);
    
    // Log user joined voice
    sendLog(
      '🎤 משתמש נכנס לשיחה',
      `**משתמש:** <@${userId}>\n**שיחה:** ${newState.channel.name}`,
      0x00FFFF
    );
  }

  if (oldState.channel && !newState.channel) {
    const startTime = voiceSessions.get(userId);
    if (startTime) {
      const elapsedMs = Date.now() - startTime;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      
      if (elapsedMinutes > 0) {
        const xpToAdd = elapsedMinutes * XP_PER_VOICE_MINUTE;
        const currentXp = getUserXP(userId) || 0;
        setUserXP(userId, currentXp + xpToAdd);
        console.log(`Added ${xpToAdd} XP to ${userId} for voice (${elapsedMinutes} minutes)`);
      }

      voiceSessions.delete(userId);
    }
    
    // Log user left voice
    sendLog(
      '🔇 משתמש יצא משיחה',
      `**משתמש:** <@${userId}>\n**שיחה:** ${oldState.channel.name}`,
      0xFF00FF
    );
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  const userId = message.author.id;

  // Log message creation - but skip logging for XP_CHECK_CHANNEL to avoid noise
  if (message.channelId !== XP_CHECK_CHANNEL_ID) {
    await sendLog(
      '💬 הודעה חדשה',
      `**משתמש:** <@${message.author.id}>\n**ערוץ:** <#${message.channelId}>\n**תוכן:** ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
      0x3498DB
    );
  }

  // XP system - message XP (only give XP if not in XP_CHECK_CHANNEL)
  if (message.channelId !== XP_CHECK_CHANNEL_ID) {
    const currentXp = getUserXP(userId) || 0;
    setUserXP(userId, currentXp + XP_PER_MESSAGE);
    console.log(`Added ${XP_PER_MESSAGE} XP to ${userId} for message`);
  }

  // Moderation: Spam detection
  if (!messageTimestamps.has(userId)) {
    messageTimestamps.set(userId, []);
  }

  const now = Date.now();
  const userMessages = messageTimestamps.get(userId);
  
  // Remove old timestamps outside the time window
  const recentMessages = userMessages.filter(timestamp => now - timestamp < SPAM_TIME_WINDOW);
  recentMessages.push(now);
  messageTimestamps.set(userId, recentMessages);

  if (recentMessages.length > SPAM_THRESHOLD) {
    try {
      await message.delete();
      const warning = await message.channel.send(`<@${userId}> בבקשה לא להספים! הודעה שלך נמחקה.`);
      
      // Log spam detection
      await sendLog(
        '🚫 זיהוי ספאם',
        `**משתמש:** <@${userId}>\n**הודעות:** ${recentMessages.length}\n**ערוץ:** <#${message.channelId}>`,
        0xFF0000
      );
      
      setTimeout(async () => {
        try {
          await warning.delete();
        } catch (err) {
          console.error('Failed to delete warning:', err);
        }
      }, 5000);

      messageTimestamps.set(userId, []);
      console.log(`Spam detected from ${userId}`);
    } catch (err) {
      console.error('Failed to delete spam message:', err);
    }
    return;
  }

  // Moderation: Manager role mention check
  if (message.mentions.roles.size > 0) {
    const hasManagedMention = message.mentions.roles.some(role => role.id === MANAGER_ROLE_ID);
    
    if (hasManagedMention) {
      try {
        await message.delete();
        const warning = await message.channel.send(`<@${userId}> בבקשה לא לתייג את המנהל!`);
        
        // Log manager mention attempt
        await sendLog(
          '🛑 ניסיון תיוג מנהל',
          `**משתמש:** <@${userId}>\n**ערוץ:** <#${message.channelId}>`,
          0xFF0000
        );
        
        setTimeout(async () => {
          try {
            await warning.delete();
          } catch (err) {
            console.error('Failed to delete manager mention warning:', err);
          }
        }, 5000);

        console.log(`Manager mention attempt from ${userId}`);
      } catch (err) {
        console.error('Failed to delete manager mention message:', err);
      }
      return;
    }
  }

  // Help system
  if (message.content.startsWith('!h')) {
    if (message.channelId !== HELP_CHANNEL_ID) {
      await sendLog(
        '❌ פקודה בחדר לא תקין',
        `**משתמש:** <@${userId}>\n**פקודה:** !h\n**ערוץ:** <#${message.channelId}>\n**הודעה:** לא בחדר הנכון`,
        0xFF6600
      );
      return message.reply(`הפקודה אפשרית רק ב <#${HELP_CHANNEL_ID}> בחדר`);
    }

    const now = Date.now();
    const userCooldown = cooldowns.get(userId);

    const member = await message.guild.members.fetch(userId);
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    if (userCooldown && !isAdmin) {
      const timeRemaining = Math.ceil((userCooldown + COOLDOWN_DURATION - now) / 1000);
      return message.reply(`⏱️ חכה ${timeRemaining} שניות לפני שתוכל להשתמש בפקודה שוב.`);
    }

    cooldowns.set(userId, now);

    const args = message.content.slice(2).trim();
    const reason = args || 'אין סיבה';
    
    let voiceChannelLink = 'המשתמש לא נמצא בשיחה!';
    if (message.member.voice.channel) {
      voiceChannelLink = `https://discord.com/channels/${message.guildId}/${message.member.voice.channelId}`;
    }

    try {
      const claimButton = new ButtonBuilder()
        .setCustomId(`help_claim_${message.id}`)
        .setLabel('Claim')
        .setStyle('Success');

      const row = new ActionRowBuilder().addComponents(claimButton);

      let voiceStatus = 'המשתמש אינו נמצא בשיחה';
      if (message.member.voice.channel) {
        voiceStatus = `המשתמש נמצא בשיחה 🔔`;
      }

      let mentionText = `<@&${staffRoleId}> <@&${highStaffRoleId}> <@${userId}> צריך אותכם!\n`;
      mentionText += `${voiceStatus}\n`;
      mentionText += `סיבה: \`${reason}\``;

      const helpMsg = await message.channel.send({
        content: mentionText,
        components: [row],
        allowedMentions: { parse: ['roles', 'users'] }
      });

      helpClaims.set(message.id, {
        userId: userId,
        channelId: message.channelId,
        messageId: helpMsg.id,
        claimed: false,
        claimedBy: null
      });

      // Log help request
      await sendLog(
        '🆘 בקשת עזרה חדשה',
        `**משתמש:** <@${userId}>\n**סיבה:** ${reason}\n**ערוץ:** <#${message.channelId}>`,
        0xFFFF00
      );

      setTimeout(() => {
        helpClaims.delete(message.id);
      }, 30000);
    } catch (err) {
      console.error('Failed to create help request:', err);
      message.reply('❌ אירעה שגיאה בעת ביצוע הפקודה.');
    }
    return;
  }

  // XP check command
  if (message.content.startsWith('!xp')) {
    console.log(`🔍 !xp command detected from ${message.author.id} in channel ${message.channelId}`);
    
    if (message.channelId !== XP_CHECK_CHANNEL_ID) {
      console.log(`❌ Wrong channel. Expected ${XP_CHECK_CHANNEL_ID}, got ${message.channelId}`);
      await sendLog(
        '❌ פקודה בחדר לא תקין',
        `**משתמש:** <@${userId}>\n**פקודה:** !xp\n**ערוץ:** <#${message.channelId}>`,
        0xFF6600
      );
      return message.reply(`הפקודה אפשרית רק ב <#${XP_CHECK_CHANNEL_ID}> בחדר`);
    }

    const args = message.content.slice(3).trim();
    let targetId = message.author.id;

    if (args) {
      if (message.mentions.has(args)) {
        targetId = message.mentions.first().id;
      } else if (/^\d+$/.test(args)) {
        targetId = args;
      } else {
        try {
          const members = await message.guild.members.search({ query: args, limit: 1 });
          if (members.size > 0) {
            targetId = members.first().id;
          } else {
            return message.reply('❌ לא מצאתי את המשתמש הזה.');
          }
        } catch (err) {
          return message.reply('❌ אירעה שגיאה בחיפוש המשתמש.');
        }
      }
    }

    const xpAmount = getUserXP(targetId) || 0;
    const user = await client.users.fetch(targetId).catch(() => null);
    const username = user ? user.username : 'Unknown User';

    console.log(`✅ !xp command: ${username} has ${xpAmount} XP`);

    // Log XP check
    await sendLog(
      '📊 בדיקת XP',
      `**משתמש שבדק:** <@${userId}>\n**בדיקה של:** <@${targetId}>\n**XP:** ${xpAmount}`,
      0x9B59B6
    );

    message.reply(`${username} Has ${xpAmount} xp.`);
    return;
  }

  // Shop command
  if (message.content === '!shop') {
    try {
      // Log shop command
      await sendLog(
        '🛒 פקודת חנות',
        `**משתמש:** <@${userId}>\n**ערוץ:** <#${message.channelId}>`,
        0x1ABC9C
      );
      
      message.reply(`🛒 חנות נמצאת כאן: <#${XP_SHOP_CHANNEL_ID}>`);
    } catch (err) {
      console.error('Failed to send shop link:', err);
    }
  }

  // Clear command
  if (message.content.startsWith('!clear')) {
    const member = await message.guild.members.fetch(message.author.id);

    if (!hasStaffPermission(member)) {
      await sendLog(
        '🚫 ניסיון כניסה לא מורשה',
        `**משתמש:** <@${userId}>\n**פקודה:** !clear\n**ערוץ:** <#${message.channelId}>\n**סיבה:** אין הרשאות`,
        0xFF0000
      );
      return; // No response, just silently ignore
    }

    const args = message.content.slice(6).trim();
    const amount = parseInt(args);

    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ בבקשה בחר מספר בין 1 ל-100.');
    }

    try {
      await message.channel.bulkDelete(amount, true);
      const confirmation = await message.channel.send(`✅ נמחקו ${amount} הודעות.`);
      
      // Log clear command
      await sendLog(
        '🗑️ מחיקת הודעות',
        `**משתמש:** <@${userId}>\n**כמות:** ${amount}\n**ערוץ:** <#${message.channelId}>`,
        0xE74C3C
      );
    } catch (err) {
      console.error('Failed to clear messages:', err);
      message.reply('❌ אירעה שגיאה בעת מחיקת ההודעות.').then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });
    }
    return;
  }

  // Say command
  if (message.content.startsWith('!say')) {
    const member = await message.guild.members.fetch(message.author.id);

    if (!hasStaffPermission(member)) {
      await sendLog(
        '🚫 ניסיון כניסה לא מורשה',
        `**משתמש:** <@${userId}>\n**פקודה:** !say\n**ערוץ:** <#${message.channelId}>\n**סיבה:** אין הרשאות`,
        0xFF0000
      );
      return; // No response, just silently ignore
    }

    const content = message.content.slice(4).trim();
    if (!content) {
      return message.reply('❌ אנא כתוב הודעה אחרי `!say`.').then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });
    }

    try {
      await message.delete();
      await message.channel.send(content);
      
      // Log say command
      await sendLog(
        '📢 פקודת say',
        `**משתמש:** <@${userId}>\n**ערוץ:** <#${message.channelId}>\n**הודעה:** ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
        0xE67E22
      );
    } catch (err) {
      console.error('Failed to send say message:', err);
    }
  }

  // Veteran check command
  if (message.content.startsWith('!vt')) {
    if (message.channelId !== VETERAN_CHANNEL_ID) {
      await sendLog(
        '❌ פקודה בחדר לא תקין',
        `**משתמש:** <@${userId}>\n**פקודה:** !vt\n**ערוץ:** <#${message.channelId}>`,
        0xFF6600
      );
      return message.reply(`הפקודה אפשרית רק ב <#${VETERAN_CHANNEL_ID}> בחדר`);
    }

    try {
      const member = await message.guild.members.fetch(message.author.id);
      const joinedAt = member.joinedTimestamp;
      const now = Date.now();
      const daysInServer = Math.floor((now - joinedAt) / (1000 * 60 * 60 * 24));
      const isVeteran = daysInServer >= VETERAN_DAYS;

      const embed = new EmbedBuilder()
        .setColor(isVeteran ? 0x00FF00 : 0xFF0000)
        .setTitle('🏅 וטרן - בדיקת תנאי')
        .addFields(
          { name: '👤 משתמש', value: `<@${message.author.id}>`, inline: false },
          { name: '📅 ימים בשרת', value: `${daysInServer} ימים`, inline: false },
          { name: '✅ זכאות', value: isVeteran ? '✅ זכאי לרול וטרן!' : `❌ צריך ${VETERAN_DAYS - daysInServer} ימים נוספים`, inline: false }
        );

      message.reply({ embeds: [embed] });
      
      // Log veteran check
      await sendLog(
        '🏅 בדיקת וטרן',
        `**משתמש:** <@${userId}>\n**ימים בשרת:** ${daysInServer}\n**זכאות:** ${isVeteran ? '✅ כן' : '❌ לא'}`,
        0x3498DB
      );
    } catch (err) {
      console.error('Failed to check veteran status:', err);
      message.reply('❌ אירעה שגיאה בעת בדיקת הסטטוס.');
    }
  }

  // Age check command
  if (message.content.startsWith('!16')) {
    try {
      const guild = message.guild;
      const roleToCheck = await guild.roles.fetch(AGE_CHECK_ROLE_ID).catch(() => null);
      
      if (!roleToCheck) {
        return message.reply('❌ לא מצאתי את הרול הנדרש.');
      }

      // Get all members with the role
      const members = await guild.members.fetch();
      const membersWithRole = members.filter(m => m.roles.cache.has(AGE_CHECK_ROLE_ID));

      if (membersWithRole.size === 0) {
        return message.reply('❌ אין מישהו עם הרול הזה.');
      }

      // Send DM to each member with the role
      let sent = 0;
      for (const member of membersWithRole.values()) {
        try {
          const embed = new EmbedBuilder()
            .setColor(0xFF6B00)
            .setTitle('# בחינת 16+ חדשה!')
            .addFields(
              { name: 'משתמש', value: `${message.author}`, inline: false }
            );

          const claimButton = new ButtonBuilder()
            .setCustomId(`age_check_claim_${message.id}`)
            .setLabel('Claim')
            .setStyle('Success');

          const row = new ActionRowBuilder().addComponents(claimButton);

          const dmMsg = await member.send({ embeds: [embed], components: [row] });
          
          // Store the claim data
          ageCheckClaims.set(message.id, {
            originalUserId: message.author.id,
            dmMessageId: dmMsg.id,
            memberId: member.id,
            claimed: false,
            claimedBy: null
          });

          sent++;
        } catch (err) {
          console.error(`Failed to send DM to ${member.user.tag}:`, err);
        }
      }

      // Log age check
      await sendLog(
        '✅ בחינת 16+ חדשה',
        `**משתמש שביצע:** <@${userId}>\n**הודעות נשלחו ל:** ${sent} חברים`,
        0xFF6B00
      );

      message.reply(`✅ בחינה נשלחה ל-${sent} משתמשים עם הרול!`).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    } catch (err) {
      console.error('Failed to execute age check:', err);
      message.reply('❌ אירעה שגיאה בעת ביצוע הפקודה.').then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    }
  }
});

// Login with error handling
console.log('Attempting to login to Discord...');
console.log('Token available:', token ? 'YES' : 'NO');
console.log('Token length:', token ? token.length : 0);

client.login(token).catch(err => {
  console.error('❌ Failed to login to Discord:', err);
  process.exit(1);
});

// Message Reaction Add - for exam emoji
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    // Ignore bot reactions
    if (user.bot) return;

    // Check if this is the emoji we're looking for (BetterZonestaffapplication: 1522683237825249474)
    if (reaction.emoji.id !== '1522683237825249474') return;

    // Check if message is in staff app channel
    if (reaction.message.channelId !== STAFF_APP_CHANNEL_ID) return;

    // Check if the message has "בחינות" in the embed title
    const hasExamEmbed = reaction.message.embeds.some(e => e.title?.includes('בחינות'));
    if (!hasExamEmbed) return;

    // Fetch the member to check roles
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // Check if user has Specialist role
    if (!member.roles.cache.has(SPECIALIST_ROLE_ID)) {
      return;
    }

    // Check if user already has an open exam ticket
    const existingTicket = Object.values(openTicketsData).find(
      ticket => ticket.createdBy === user.id && ticket.category === 'staff_exam'
    );

    if (existingTicket) {
      const ticketChannel = reaction.message.guild.channels.cache.get(existingTicket.channelId);
      if (ticketChannel) {
        try {
          await user.send(`✅ כבר יש לך בחינה פתוחה: ${ticketChannel.url}`);
        } catch (err) {
          console.log('Could not send DM');
        }
      }
      return;
    }

    // Get or create exam category
    const guild = reaction.message.guild;
    let examCategoryId = null;
    
    let examCategory = guild.channels.cache.find(c => 
      c.isCategory() && c.name.toLowerCase().includes('בחינה')
    );

    if (!examCategory) {
      examCategory = await guild.channels.create({
        name: '🧪 בחינות לצוות',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ['ViewChannel']
          },
          {
            id: SPECIALIST_ROLE_ID,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          }
        ]
      });
    }

    examCategoryId = examCategory.id;

    // Create exam ticket channel
    const ticketChannel = await guild.channels.create({
      name: `exam-${user.username}`,
      type: ChannelType.GuildText,
      parent: examCategoryId,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: ['ViewChannel']
        },
        {
          id: user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        },
        {
          id: SPECIALIST_ROLE_ID,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        }
      ]
    });

    // Create ticket info embed
    const examEmbed = new EmbedBuilder()
      .setColor(0x9400D3)
      .setTitle('🧪 בחינה לצוות')
      .setDescription(`**בחינה של:** <@${user.id}>`)
      .addFields(
        { name: 'הנושאים:', value: '1. ידע בצוות\n2. יכולת ניהול\n3. התנהגות חברתית\n4. טיפול במקרים\n5. ידע בחוקים', inline: false },
        { name: 'הוראות:', value: 'יש למענה מדויק וברור. יתן לך מנהל לענות על שאלות. עונה על הכל בחוקים ובנימוסים.', inline: false }
      )
      .setTimestamp();

    const closeButton = new ButtonBuilder()
      .setCustomId(`exam_close_${ticketChannel.id}`)
      .setLabel('סגור בחינה')
      .setStyle('Danger');

    const row = new ActionRowBuilder().addComponents(closeButton);

    await ticketChannel.send({
      embeds: [examEmbed],
      components: [row]
    });

    // Send exam questions
    const questionsEmbed = new EmbedBuilder()
      .setColor(0x9400D3)
      .setTitle('📝 שאלות הבחינה')
      .addFields(
        { name: 'שאלה 1', value: 'מה לדעתך הם הדברים החשובים ביותר של staff member?', inline: false },
        { name: 'שאלה 2', value: 'כיצד היית מטפל ב user שמפר חוקי השרת?', inline: false },
        { name: 'שאלה 3', value: 'מה המוטיבציה שלך להיות staff?', inline: false },
        { name: 'שאלה 4', value: 'תן דוגמה לכך שטיפלת בכללים בעבר', inline: false },
        { name: 'שאלה 5', value: 'כמה זמן אתה יכול להיות online ביום?', inline: false }
      );

    await ticketChannel.send({ embeds: [questionsEmbed] });

    // Store ticket info
    const ticketData = {
      channelId: ticketChannel.id,
      createdBy: user.id,
      category: 'staff_exam',
      createdAt: Date.now(),
      claimed: false
    };
    setTicketData(ticketChannel.id, ticketData);

    // Send DM confirmation
    try {
      await user.send(`✅ בחינה נפתחה בהצלחה! ${ticketChannel.url}`);
    } catch (err) {
      console.log('Could not send DM');
    }

    // Log
    await sendLog(
      '🧪 בחינה נפתחה',
      `**משתמש:** <@${user.id}>\n**ערוץ:** <#${ticketChannel.id}>`,
      0x9400D3
    );

  } catch (err) {
    console.error('Error in exam_start:', err);
  }
});

// Global error handlers
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

client.on('warn', (info) => {
  console.warn('⚠️ Discord client warning:', info);
});

// Listen on a port for Render health checks
const PORT = process.env.PORT || 3000;
require('http').createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
}).listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});
