const {
  Client,
  GatewayIntentBits,
  Partials,
  Routes,
  REST,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');

const TOKEN = 'MTUyNzg1MjcxNjcyNDg0Njc1NA.GaaZ1w.BtNqIroZZgctQVkCLPong9YH_JIkEGNd6rxitg';
const CLIENT_ID = '1527852716724846754';
const GUILD_ID = '1373455308067963000';
const STAFF_ROLE_ID = '1439346974833770536';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const rest = new REST({ version: '10' }).setToken(TOKEN);

// Register /create-ticket
(async () => {
  const command = {
    name: 'create-ticket',
    description: 'Create a ticket panel message',
    options: [
      {
        name: 'dm_category',
        description: 'Category for DM-type tickets',
        type: 7,
        required: true,
      },
      {
        name: 'in_server_category',
        description: 'Category for in-server tickets',
        type: 7,
        required: true,
      },
      {
        name: 'post_channel',
        description: 'Channel to post the ticket panel',
        type: 7,
        required: true,
      },
    ],
  };

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [command],
  });
  console.log('Command registered.');
})();

let ticketCounter = 0;

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  // Slash command
  if (interaction.isChatInputCommand() && interaction.commandName === 'create-ticket') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
      return interaction.reply({ content: 'No perms', ephemeral: true });

    const dmCategory = interaction.options.getChannel('dm_category');
    const inServerCategory = interaction.options.getChannel('in_server_category');
    const postChannel = interaction.options.getChannel('post_channel');

    if (!dmCategory || dmCategory.type !== ChannelType.GuildCategory)
      return interaction.reply({ content: 'dm_category must be a category.', ephemeral: true });
    if (!inServerCategory || inServerCategory.type !== ChannelType.GuildCategory)
      return interaction.reply({ content: 'in_server_category must be a category.', ephemeral: true });

    // Panel embed like the screenshot
    const panelEmbed = new EmbedBuilder()
      .setTitle('PFA Support Tickets')
      .setDescription(
        'Click a button below to open a ticket.\n' +
        'Please only open one ticket per issue.'
      )
      .setColor(0x5865f2);

    // Exactly two buttons: General Help / Report A Player
    const panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(JSON.stringify({ t: 'open', kind: 'general' }))
        .setLabel('General Help')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(JSON.stringify({ t: 'open', kind: 'report' }))
        .setLabel('Report A Player')
        .setStyle(ButtonStyle.Danger),
    );

    await postChannel.send({ embeds: [panelEmbed], components: [panelRow] });

    client.ticketConfig = client.ticketConfig || {};
    client.ticketConfig[postChannel.id] = {
      dmCategoryId: dmCategory.id,
      inServerCategoryId: inServerCategory.id,
    };

    return interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
  }

  // Buttons
  if (interaction.isButton()) {
    let payload;
    try {
      payload = JSON.parse(interaction.customId);
    } catch {
      return interaction.reply({ content: 'Invalid button.', ephemeral: true });
    }

    // Main panel buttons (General Help / Report A Player)
    if (payload.t === 'open') {
      const isReport = payload.kind === 'report';

      const title = isReport ? 'Report A Player' : 'General Help';
      const desc = isReport
        ? 'Please choose if you want to handle this report in DMs or in a server ticket channel.'
        : 'Please choose if you want to handle this ticket in DMs or in a server ticket channel.';

      const askEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(isReport ? 0xe74c3c : 0x5865f2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(JSON.stringify({ t: 'delivery', method: 'dm', report: isReport }))
          .setLabel('DMs')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(JSON.stringify({ t: 'delivery', method: 'in_server', report: isReport }))
          .setLabel('In Server')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({ embeds: [askEmbed], components: [row], ephemeral: true });
    }

    // Delivery choice
    if (payload.t === 'delivery' && (payload.method === 'dm' || payload.method === 'in_server')) {
      await interaction.deferReply({ ephemeral: true });
      const isReport = payload.report || false;
      const invokingUser = interaction.user;
      ticketCounter++;

      const config = client.ticketConfig ? Object.values(client.ticketConfig)[0] : null;
      const dmCategoryId = config?.dmCategoryId;
      const inServerCategoryId = config?.inServerCategoryId;

      const ticketEmbed = new EmbedBuilder()
        .setTitle(isReport ? 'Report A Player Ticket' : 'Ticket')
        .setDescription(
          isReport
            ? 'Please send the User ID and attach video/photo evidence for the report.'
            : 'This is a ticket for you and the staff to talk about something.'
        )
        .setColor(isReport ? 0xe74c3c : 0x00ae86);

      const guild = client.guilds.cache.get(GUILD_ID);
      if (!guild) return interaction.editReply({ content: 'Guild not found.', ephemeral: true });

      const channelName = `${invokingUser.username.toLowerCase()}-${ticketCounter}`;

      // DM tickets
      if (payload.method === 'dm') {
        if (!dmCategoryId)
          return interaction.editReply({ content: 'DM category not configured.', ephemeral: true });

        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: dmCategoryId,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: STAFF_ROLE_ID,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
              ],
            },
            {
              id: invokingUser.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
              ],
            },
          ],
        });

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(JSON.stringify({ t: 'claim', ticketId: ticketChannel.id }))
            .setLabel('Claim Ticket')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(JSON.stringify({ t: 'close', ticketId: ticketChannel.id }))
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
          content: `<@${invokingUser.id}>`,
          embeds: [ticketEmbed],
          components: [actionRow],
        });

        try {
          const dm = await invokingUser.createDM();
          await dm.send({ content: `@${invokingUser.username}`, embeds: [ticketEmbed] });

          client.openTickets = client.openTickets || {};
          client.openTickets[ticketChannel.id] = {
            userId: invokingUser.id,
            type: 'dm',
            staffClaimer: null,
            isReport,
          };
          client.openTickets['dm:' + invokingUser.id] = {
            channelId: ticketChannel.id,
            type: 'dm',
            isReport,
          };

          return interaction.editReply({
            content: `DM ticket opened. Check your DMs and staff channel ${ticketChannel}.`,
            ephemeral: true,
          });
        } catch {
          return interaction.editReply({
            content: 'Could not DM user. Please ensure DMs are open.',
            ephemeral: true,
          });
        }
      }

      // In-server tickets
      if (!inServerCategoryId)
        return interaction.editReply({ content: 'In-server category not configured.', ephemeral: true });

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: inServerCategoryId,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: STAFF_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
            ],
          },
          {
            id: invokingUser.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
            ],
          },
        ],
      });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(JSON.stringify({ t: 'claim', ticketId: ticketChannel.id }))
          .setLabel('Claim Ticket')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(JSON.stringify({ t: 'close', ticketId: ticketChannel.id }))
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(JSON.stringify({ t: 'ping', ticketId: ticketChannel.id }))
          .setLabel('Ping Staff')
          .setStyle(ButtonStyle.Primary)
      );

      await ticketChannel.send({
        content: `<@${invokingUser.id}>`,
        embeds: [ticketEmbed],
        components: [actionRow],
      });

      client.openTickets = client.openTickets || {};
      client.openTickets[ticketChannel.id] = {
        userId: invokingUser.id,
        type: 'in_server',
        staffClaimer: null,
        isReport,
      };

      return interaction.editReply({
        content: `In-server ticket created: ${ticketChannel}`,
        ephemeral: true,
      });
    }

    // Claim (first staff only, then disabled)
    if (payload.t === 'claim') {
      const ticketId = payload.ticketId;
      const record = client.openTickets && client.openTickets[ticketId];
      if (!record) return interaction.reply({ content: 'Ticket not found.', ephemeral: true });

      if (record.staffClaimer) {
        return interaction.reply({
          content: `This ticket is already claimed by <@${record.staffClaimer}>.`,
          ephemeral: true,
        });
      }

      if (
        !interaction.member.roles.cache.has(STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
      ) {
        return interaction.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
      }

      record.staffClaimer = interaction.user.id;
      client.openTickets[ticketId] = record;

      // Disable claim button on the message
      const msg = interaction.message;
      if (msg && msg.components?.length) {
        const newRows = msg.components.map((row) => {
          const r = ActionRowBuilder.from(row);
          r.components = r.components.map((c) => {
            const btn = ButtonBuilder.from(c);
            try {
              const data = JSON.parse(btn.data?.custom_id || btn.customId);
              if (data.t === 'claim') btn.setDisabled(true);
            } catch {}
            return btn;
          });
          return r;
        });

        await msg.edit({ components: newRows }).catch(() => {});
      }

      await interaction.reply({
        content: `You claimed this ticket. Only you can respond as staff in this ticket.`,
        ephemeral: true,
      });

      await interaction.channel
        ?.send({ content: `<@${interaction.user.id}> claimed this ticket.` })
        .catch(() => {});
      return;
    }

    // Close
    if (payload.t === 'close') {
      const ticketId = payload.ticketId;
      const record = client.openTickets && client.openTickets[ticketId];
      if (!record) return interaction.reply({ content: 'Ticket not found.', ephemeral: true });

      if (
        !interaction.member.roles.cache.has(STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
      )
        return interaction.reply({ content: 'Only staff can close tickets.', ephemeral: true });

      const ch = await client.channels.fetch(ticketId).catch(() => null);
      if (ch) {
        await ch.send('Ticket will be closed.').catch(() => {});
        setTimeout(() => ch.delete().catch(() => {}), 3000);
      }

      try {
        const user = await client.users.fetch(record.userId);
        await user.send('Your ticket was closed by staff.');
      } catch {}

      delete client.openTickets[ticketId];

      return interaction.reply({ content: 'Ticket closed.', ephemeral: true });
    }

    // Ping Staff
    if (payload.t === 'ping') {
      const ticketId = payload.ticketId;
      const record = client.openTickets && client.openTickets[ticketId];
      if (!record) return interaction.reply({ content: 'Ticket not found.', ephemeral: true });

      const ch = interaction.channel;
      if (!ch || ch.id !== ticketId)
        return interaction.reply({ content: 'Invalid ticket channel.', ephemeral: true });

      await ch.send(`<@&${STAFF_ROLE_ID}> A user has requested staff in this ticket.`);
      return interaction.reply({ content: 'Staff pinged.', ephemeral: true });
    }
  }
});

// Message forwarding + claim enforcement
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  // In guild ticket channels
  if (client.openTickets && client.openTickets[msg.channel.id]) {
    const ticket = client.openTickets[msg.channel.id];

    // Enforce claimer for in_server
    if (ticket.type === 'in_server' && ticket.staffClaimer) {
      const isStaff =
        msg.member?.roles?.cache?.has(STAFF_ROLE_ID) ||
        msg.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
      if (isStaff && msg.author.id !== ticket.staffClaimer) {
        await msg.delete().catch(() => {});
        return;
      }
    }

    // Only DM-type tickets forward staff messages to user
    if (ticket.type === 'dm') {
      try {
        const user = await client.users.fetch(ticket.userId);
        if (msg.channel.type !== ChannelType.DM) {
          await user
            .send({
              content: `Staff (${msg.author.tag}): ${msg.content || ''}`,
              files: msg.attachments.map((a) => a.url),
            })
            .catch(() => {});
        }
      } catch {}
    }

    return;
  }

  // From user DMs to staff (only DM tickets)
  if (msg.channel.type === ChannelType.DM) {
    const ticket = client.openTickets && client.openTickets['dm:' + msg.author.id];
    if (ticket) {
      const staffChannel = await client.channels.fetch(ticket.channelId).catch(() => null);
      if (staffChannel) {
        await staffChannel
          .send({
            content: `User (${msg.author.tag}): ${msg.content || ''}`,
            files: msg.attachments.map((a) => a.url),
          })
          .catch(() => {});
      }
    }
  }
});

client.login(TOKEN);