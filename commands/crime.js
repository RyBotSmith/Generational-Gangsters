const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crime')
    .setDescription('Commit a crime to earn cash and XP'),

  async execute(interaction) {
    await interaction.reply({ content: '🔫 Crime system coming soon!', ephemeral: true });
  },
};
