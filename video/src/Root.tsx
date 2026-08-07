import {Composition} from 'remotion';
import {MandateDemo} from './MandateDemo';

export const RemotionRoot = () => (
  <Composition
    id="MandateDemo"
    component={MandateDemo}
    durationInFrames={1080}
    fps={30}
    width={1920}
    height={1080}
  />
);
