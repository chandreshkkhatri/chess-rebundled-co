import AdmZip from 'adm-zip';

const PGN_MENTOR_BASE_URL = 'https://www.pgnmentor.com/players';

export interface DownloadResult {
  playerName: string;
  pgnContent: string;
  fileSize: number;
}

/**
 * Downloads a player's PGN file from PGN Mentor
 * @param playerName - The player name as it appears on PGN Mentor (e.g., "Kasparov", "Fischer")
 * @returns The PGN content as a string
 */
export async function downloadPlayerPgn(playerName: string): Promise<DownloadResult> {
  const url = `${PGN_MENTOR_BASE_URL}/${playerName}.zip`;

  console.log(`  Downloading ${playerName} from ${url}...`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${playerName}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Extract PGN from ZIP
  const zip = new AdmZip(buffer);
  const zipEntries = zip.getEntries();

  // Find the PGN file in the ZIP
  const pgnEntry = zipEntries.find(entry =>
    entry.entryName.toLowerCase().endsWith('.pgn')
  );

  if (!pgnEntry) {
    throw new Error(`No PGN file found in ${playerName}.zip`);
  }

  const pgnContent = pgnEntry.getData().toString('utf-8');

  console.log(`  Downloaded ${playerName}: ${(pgnContent.length / 1024).toFixed(1)} KB`);

  return {
    playerName,
    pgnContent,
    fileSize: pgnContent.length,
  };
}

/**
 * Downloads multiple players' PGN files with rate limiting
 * @param playerNames - Array of player names
 * @param delayMs - Delay between downloads to be respectful to the server
 */
export async function downloadMultiplePlayers(
  playerNames: string[],
  delayMs: number = 1000
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  const errors: { player: string; error: string }[] = [];

  for (let i = 0; i < playerNames.length; i++) {
    const playerName = playerNames[i];

    try {
      const result = await downloadPlayerPgn(playerName);
      results.push(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  Error downloading ${playerName}: ${errorMsg}`);
      errors.push({ player: playerName, error: errorMsg });
    }

    // Add delay between downloads (except for the last one)
    if (i < playerNames.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (errors.length > 0) {
    console.log(`\nDownload errors (${errors.length}):`);
    errors.forEach(e => console.log(`  - ${e.player}: ${e.error}`));
  }

  return results;
}
