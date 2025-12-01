export interface CognitiveDataPoint {
  time: number;
  attention: number;
  stress: number;
  curiosity: number;
}

export interface Notification {
  id: number;
  type: 'stress' | 'attention-drop' | 'low-attention' | 'low-curiosity';
  title: string;
  message: string;
  intensity: number; // Value from 0 to 1
}