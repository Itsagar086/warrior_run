// Lighting setup for the Snake Way. The engine's boot() builds the actual
// light rig - moonlight key, warm torch fill, ambient and the shadow map -
// from this palette and mood, which is why they live together here.

export const LIGHTING = {
  palette: ['#ff8c2e', '#3a2f6b', '#4de0c0', '#c9a24b', '#20243f'],
  mood: 'sunset'
};

// Night-sky clear colour behind Mount Kailash.
export const BACKGROUND_COLOR = '#20243f';
