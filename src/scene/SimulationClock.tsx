import { useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { simulationSpeed, useExplorer } from '../state/useExplorer';
import { simulation } from '../simulation/clock';

/** A single owner for frame, playback and page-lifecycle clock boundaries. */
export function SimulationClock() {
  const gl = useThree(s => s.gl);
  useLayoutEffect(() => {
    const document = gl.domElement.ownerDocument;
    const window = document.defaultView;
    let pageActive = true, frozen = false;
    const visible = () => pageActive && !frozen && document.visibilityState === 'visible';
    const initial = useExplorer.getState();
    simulation.start({ paused: initial.paused, speed: simulationSpeed(initial), visible: visible() });
    const unsubscribe = useExplorer.subscribe((state, previous) => {
      const speed = simulationSpeed(state);
      if (state.paused !== previous.paused || speed !== simulationSpeed(previous)) {
        simulation.setPlayback({ paused: state.paused, speed });
      }
    });
    const onVisibility = () => simulation.setVisible(visible());
    const onPageHide = () => { pageActive = false; onVisibility(); };
    const onPageShow = () => { pageActive = true; onVisibility(); };
    const onFreeze = () => { frozen = true; onVisibility(); };
    const onResume = () => { frozen = false; onVisibility(); };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('freeze', onFreeze);
    document.addEventListener('resume', onResume);
    window?.addEventListener('pagehide', onPageHide);
    window?.addEventListener('pageshow', onPageShow);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('freeze', onFreeze);
      document.removeEventListener('resume', onResume);
      window?.removeEventListener('pagehide', onPageHide);
      window?.removeEventListener('pageshow', onPageShow);
      simulation.stop();
    };
  }, [gl]);
  // Always precedes planet positions (-1), camera following and visual effects.
  useFrame(() => simulation.advanceFrame(), -2);
  return null;
}
