#!/usr/bin/env node

/**
 * List all available ElevenLabs voices with their IDs
 * Usage: node scripts/list-elevenlabs-voices.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

async function listVoices() {
  const { ElevenLabsClient } = require('elevenlabs');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: ELEVENLABS_API_KEY not found in backend/.env');
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });

  try {
    console.log('🎙️  Fetching available ElevenLabs voices...\n');

    const voicesData = await client.voices.getAll();
    const voices = Array.isArray(voicesData) ? voicesData : voicesData.voices || Object.values(voicesData);

    console.log('Available Voices:');
    console.log('━'.repeat(80));

    voices.forEach((voice, index) => {
      console.log(`\n${index + 1}. ${voice.name}`);
      console.log(`   ID: ${voice.voice_id}`);
      if (voice.description) {
        console.log(`   Description: ${voice.description}`);
      }
      if (voice.labels) {
        console.log(`   Labels: ${Object.entries(voice.labels).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
    });

    console.log('\n' + '━'.repeat(80));
    console.log(`\nTotal voices available: ${voices.length}`);

  } catch (error) {
    console.error('❌ Error fetching voices:');
    console.error(error.message);
    process.exit(1);
  }
}

listVoices();
