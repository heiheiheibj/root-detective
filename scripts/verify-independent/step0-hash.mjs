// 第 0 节：sha256 核对（Node 流式，避免 PowerShell Get-FileHash 慢）
import fs from 'node:fs';
import crypto from 'node:crypto';

const files = [
  ['scripts/.work/raw/ecdict.csv', 65933428, '1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf'],
  ['scripts/.work/raw/kaikki-English.jsonl', 3244830710, '3c202ca40f2a57d74e8bc4d2567d4782cd0aa2e5251ed40522a691338ac49afa'],
  ['scripts/.work/raw/cigen-roots_affixes.json', 388646, 'b20aae11372041d79e4866154abec4ed8ca6ec0e3cb1e1ddb1bc09795c20dcef'],
  ['scripts/.work/raw/morphynet-eng-derivational.tsv', 8169109, '5920edacc1888b14464fc5cd96beea0a721221d56d1dc0e49de22f4c7c537c50'],
  ['scripts/.work/raw/wordroot.txt', 370702, '4b400dc5980e4a362fa12c7a49b326bb621c4e6bebd5f37146fbdcbe9db6bb6e'],
  ['scripts/.work/raw/shiweihappy-roots.json', 123973, 'd6c58979c9c634e934c22975e48f6b1a802d537a4c35b8baafe085e3a4a34884'],
  ['scripts/.work/derived/roots.candidates.json', 764323, 'd77ee3b3172da3bf306140e8e336002603c98d7c4ce9d2e51a0705f61ada2eac'],
];

const out = [];
let allOk = true;
for (const [path, size, sha] of files) {
  if (!fs.existsSync(path)) { out.push(`${path} | MISSING`); allOk = false; continue; }
  const actualSize = fs.statSync(path).size;
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(path, 'r');
  const buf = Buffer.alloc(8 * 1024 * 1024);
  let read;
  while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, read));
  fs.closeSync(fd);
  const actualSha = hash.digest('hex');
  const ok = actualSize === size && actualSha === sha;
  if (!ok) allOk = false;
  out.push(`${path} | size ${actualSize}${actualSize === size ? '✓' : `✗(预期${size})`} | sha ${ok ? '✓' : `✗ ${actualSha}`}`);
}
out.push(allOk ? 'ALL-MATCH' : 'MISMATCH');
fs.writeFileSync('scripts/verify-independent/out/hash-check.txt', out.join('\n'));
console.log(out.join('\n'));
