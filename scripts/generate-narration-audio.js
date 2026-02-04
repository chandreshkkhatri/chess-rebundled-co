#!/usr/bin/env node

/**
 * Generate AI voice narration audio files for Chess Rebundled ad video
 * Uses ElevenLabs Text-to-Speech API
 *
 * Usage:
 *   node scripts/generate-narration-audio.js
 *
 * Requirements:
 * - ELEVENLABS_API_KEY in backend/.env
 * - docs/marketing/NARRATION_SCRIPT.md must exist
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

// Run ElevenLabs (only service)
runElevenLabs();

// ============================================================================
// ElevenLabs Implementation
// ============================================================================

async function runElevenLabs() {
  const { ElevenLabsClient } = require('elevenlabs');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: ELEVENLABS_API_KEY not found in backend/.env');
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });

  async function generateAudio(text, outputPath, voiceId, voiceName) {
    console.log(`\n🎙️  Generating audio: ${outputPath}`);
    console.log(`   Voice: ${voiceName}`);
    console.log(`   Text length: ${text.length} characters`);

    try {
      const audio = await client.generate({
        voice: voiceId,
        text: text,
        model_id: 'eleven_monolingual_v1',
      });

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`   Created directory: ${outputDir}`);
      }

      // Handle different response formats from ElevenLabs SDK
      let buffer;
      if (audio instanceof Buffer) {
        buffer = audio;
      } else if (audio.arrayBuffer && typeof audio.arrayBuffer === 'function') {
        buffer = Buffer.from(await audio.arrayBuffer());
      } else if (audio[Symbol.asyncIterator]) {
        // Handle async iterable (stream)
        const chunks = [];
        for await (const chunk of audio) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
      } else if (typeof audio === 'object' && audio.buffer) {
        // Handle Uint8Array or similar
        buffer = Buffer.from(audio);
      } else {
        // Fallback: try to convert directly
        buffer = Buffer.from(audio);
      }

      fs.writeFileSync(outputPath, buffer);

      const stats = fs.statSync(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`   ✅ Audio generated successfully!`);
      console.log(`   File size: ${fileSizeMB} MB`);

      return true;
    } catch (error) {
      console.error(`   ❌ Error generating audio: ${error.message}`);
      throw error;
    }
  }

  async function main() {
    console.log('🎬 Chess Rebundled - Ad Narration Audio Generator');
    console.log('📢 Service: ElevenLabs Text-to-Speech');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const scriptPath = path.join(__dirname, '../docs/marketing/NARRATION_SCRIPT.md');

    if (!fs.existsSync(scriptPath)) {
      console.error(`\n❌ Error: Narration script not found at ${scriptPath}`);
      process.exit(1);
    }

    try {
      console.log('\n📖 Extracting narration text...');
      const content = fs.readFileSync(scriptPath, 'utf8');
      const fullText = cleanNarrationText(extractSection(content, 'full'));
      const shortText = cleanNarrationText(extractSection(content, 'short'));

      console.log(`   Full version: ${fullText.length} characters`);
      console.log(`   Short version: ${shortText.length} characters`);

      // ElevenLabs voice IDs for high-quality voices
      const voices = [
        {
          voiceId: 'EXAVITQu4vr4xnSDxMaL', // Rachel - Professional US English female
          voiceName: 'Rachel (US Female - Professional)',
          prefix: 'us-female-elevenlabs'
        },
        {
          voiceId: '6FiCmD8eY5VyjOdG5Zjk', // US male voice
          voiceName: 'US Male',
          prefix: 'us-male-elevenlabs'
        },
        {
          voiceId: 'TmPeb2hSxdVrThJLywkg', // Vanishree - Energetic Indian English female
          voiceName: 'Vanishree (Indian Female - Energetic)',
          prefix: 'indian-female-elevenlabs'
        },
        {
          voiceId: 'RpiHVNPKGBg7UmgmrKrN', // Indian male voice
          voiceName: 'Indian Male',
          prefix: 'indian-male-elevenlabs'
        }
      ];

      console.log('\n🔊 Generating audio files...');

      const audioDir = path.join(__dirname, '../docs/marketing/audio');
      const generatedFiles = [];

      for (const voice of voices) {
        console.log(`\n📢 Generating ${voice.voiceName} versions...`);

        const fullAudioPath = path.join(audioDir, `narration-full-60-90s-${voice.prefix}.mp3`);
        const shortAudioPath = path.join(audioDir, `narration-short-45-60s-${voice.prefix}.mp3`);

        await generateAudio(fullText, fullAudioPath, voice.voiceId, voice.voiceName);
        await generateAudio(shortText, shortAudioPath, voice.voiceId, voice.voiceName);

        generatedFiles.push({
          voice: voice.voiceName,
          files: [fullAudioPath, shortAudioPath]
        });
      }

      console.log('\n' + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Audio generation complete!');
      console.log('\nGenerated files by voice:');

      for (const item of generatedFiles) {
        console.log(`\n${item.voice}:`);
        for (const file of item.files) {
          const filename = path.basename(file);
          console.log(`  • ${filename}`);
        }
      }

      console.log('\nYou can now use these audio files in your video editor.');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
      console.error('\n❌ Error during audio generation:');
      console.error(error);
      process.exit(1);
    }
  }

  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

function extractSection(content, version) {
  if (version === 'full') {
    const match = content.match(/## Full Version \(60-90 seconds\)([\s\S]*?)## Short Version/);
    if (!match) {
      throw new Error('Could not find Full Version section in narration script');
    }
    return match[1];
  } else if (version === 'short') {
    const match = content.match(/## Short Version \(45-60 seconds\)([\s\S]*?)## Screen Recording Tips/);
    if (!match) {
      throw new Error('Could not find Short Version section in narration script');
    }
    return match[1];
  }
  throw new Error(`Unknown version: ${version}`);
}

function cleanNarrationText(text) {
  return text
    .replace(/^#+\s*\[.*?\]\s+.*?$/gm, '')
    .replace(/\[\d+-\d+s\]\s*/g, '')
    .replace(/\*Screen:.*?\*\n/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)(?<!\w)\*([^*]+?)\*(?!\*)/g, '$1')
    .replace(/^"+|"+$/gm, '')
    .replace(/^[\s]*[-=━]+[\s]*$/gm, '')
    .replace(/\n\n+/g, '\n\n')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .join('\n')
    .trim();
}
