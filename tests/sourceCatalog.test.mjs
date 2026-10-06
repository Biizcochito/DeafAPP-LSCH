import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, buildLschSourceCatalog, safeSourceUrl } from '../training/sourceCatalog.js';
test('CSV preserves accents, quoted commas, newlines and escaped quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFID,Name\r\n1,"Señas, Chile"\r\n2,"Una ""frase""\ny otra"\r\n'), [{ ID: '1', Name: 'Señas, Chile' }, { ID: '2', Name: 'Una "frase"\ny otra' }]);
  assert.throws(() => parseCsv('A,B\n1\n'), /incompleta/);
  assert.throws(() => parseCsv('A\n"incomplete'), /cerrar/);
});
test('only LSCh entries become candidates and repository MIT does not grant a video license', () => {
  const channels = [{ 'Channel ID': '1', 'Sign Language': 'LSCh', Name: 'Fuente chilena', License: 'CC', Source: 'https://example.test/channel' }, { 'Channel ID': '2', 'Sign Language': 'LSA', Name: 'Otra lengua' }];
  const video = { ID: '1', 'Channel ID': '1', 'Sign Language': 'LSCh', 'Video Name': 'Familia', 'Webpage URL': 'https://example.test/video', 'Video Length': '30' };
  const catalog = buildLschSourceCatalog(channels, [video, { ...video, ID: '2' }, { ...video, ID: '3', 'Webpage URL': 'javascript:alert(1)' }, { ...video, ID: '4', 'Channel ID': '2', 'Sign Language': 'LSA' }]);
  assert.equal(catalog.videos.length, 1); assert.equal(catalog.rejected.length, 2);
  assert.equal(catalog.videos[0].reviewStatus, 'unreviewed'); assert.deepEqual(catalog.videos[0].segments, []);
  assert.equal(catalog.videoLicensesInheritedFromMetadata, false);
  assert.equal(safeSourceUrl('https://user:password@example.test'), null);
});
