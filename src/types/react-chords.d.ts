declare module '@tombatossals/react-chords' {
  import React from 'react';

  export interface ChordProps {
    chord: any;
    instrument: any;
    lite?: boolean;
  }

  const Chord: React.FC<ChordProps>;
  export default Chord;
}
