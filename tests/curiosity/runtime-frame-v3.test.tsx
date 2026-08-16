import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CuriosityRuntimeFrame } from '@/components/curiosity/runtime-frame';
import { curiosityExperienceSpecV3Schema } from '@/lib/curiosity/experience-spec-v3';
import { validV3Spec } from './v3-fixture';

describe('CuriosityRuntimeFrame V3', () => {
  it('selects the trusted renderer only through the V3 scene registry', () => {
    const html = renderToStaticMarkup(
      <CuriosityRuntimeFrame
        experienceId="cur_moon_demo"
        versionId="ver_moon_demo_1"
        spec={curiosityExperienceSpecV3Schema.parse(validV3Spec)}
        restoredState={{ inspected: ['moon'] }}
        onEvent={() => undefined}
        onStateChange={() => undefined}
      />,
    );
    expect(html).toContain('data-scene-type="relative-motion"');
    expect(html).toContain('已查看 1 个对象');
    expect(html).not.toContain('iframe');
  });
});
