import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

interface UmdContext {
  console: Console;
  window: Record<string, unknown>;
  self: Record<string, unknown>;
  WebGL360Player?: {
    createWebGL360Player?: unknown;
    selectInitialSource?: unknown;
  };
}

describe('distribution artifacts', () => {
  it('exports the public API from the built ESM bundle', async () => {
    const bundleUrl = new URL('../../dist/webgl-360-player.min.js', import.meta.url).href;
    const mod = await import(/* @vite-ignore */ bundleUrl);

    expect(mod.createWebGL360Player).toEqual(expect.any(Function));
    expect(mod.selectInitialSource).toEqual(expect.any(Function));
  });

  it('loads the standalone UMD browser bundle without a module system', () => {
    const bundlePath = new URL('../../dist/webgl-360-player.standalone.umd.min.js', import.meta.url);
    const code = readFileSync(bundlePath, 'utf8');
    const context: UmdContext = {
      console,
      window: {},
      self: {},
    };

    vm.runInNewContext(code, context);

    expect(context).toHaveProperty('WebGL360Player');
    expect(context.WebGL360Player).toMatchObject({
      createWebGL360Player: expect.any(Function),
      selectInitialSource: expect.any(Function),
    });
  });
});
