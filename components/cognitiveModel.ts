
import type { CognitiveDataPoint } from '../types';

// Represents the simulated inputs to our model
export interface CognitiveModelInput {
    interactionLevel: number; // 0-1, how active the user is
    simulatedGazeFocus: number; // 0-1, is user looking at relevant things
    simulatedValence: 'positive' | 'negative' | 'neutral'; // from facial expression
    visualScanning: number; // 0-1, represents active visual exploration/reading
}

// Internal state of our cognitive model
interface CognitiveModelState {
    attention: number;
    stress: number;
    curiosity: number;
    fatigue: number; // increases over time, reduces attention recovery
    engagement: number; // builds up with interaction, boosts curiosity
}

// A simple leaky integrator/decay function
const decay = (value: number, rate: number) => Math.max(0, value * (1 - rate));
const approach = (current: number, target: number, amount: number) => {
    return current < target ? Math.min(current + amount, target) : Math.max(current - amount, target);
};


export class CognitiveModel {
    private state: CognitiveModelState;

    constructor() {
        this.state = {
            attention: 50,
            stress: 30,
            curiosity: 60,
            fatigue: 0,
            engagement: 0.5,
        };
    }

    public update(input: CognitiveModelInput): CognitiveDataPoint {
        // --- Update internal state based on previous state ---

        // Fatigue increases slowly, faster with high stress
        this.state.fatigue = Math.min(1, this.state.fatigue + 0.005 + (this.state.stress / 100) * 0.005);
        
        // Engagement decays but is boosted by interaction
        this.state.engagement = decay(this.state.engagement, 0.02);
        this.state.engagement = Math.min(1, this.state.engagement + input.interactionLevel * 0.1);


        // --- Calculate new cognitive values based on inputs and state ---
        
        // Attention:
        // - Boosted by interaction and gaze focus.
        // - Reduced by fatigue and stress.
        // - Has a natural tendency to drift towards 50.
        let attentionTarget = 50;
        attentionTarget += input.simulatedGazeFocus * 50; // High gaze = target 100
        attentionTarget -= this.state.fatigue * 30; // High fatigue = target drops
        attentionTarget -= (this.state.stress / 100) * 20; // High stress = target drops
        this.state.attention = approach(this.state.attention, attentionTarget, input.interactionLevel > 0 ? 5 : 2);


        // Stress:
        // - Increases with cognitive load (sustained high attention).
        // - Spikes with negative valence.
        // - Slowly decreases otherwise.
        let stressChange = -0.5; // Natural decay
        if (this.state.attention > 80) {
            stressChange += 1.5; // Cognitive load
        }
        if (input.simulatedValence === 'negative') {
            stressChange += 20; // Sudden stress event
        }
        if (input.simulatedValence === 'positive') {
            stressChange -= 5; // Positive event reduces stress
        }
        this.state.stress = this.state.stress + stressChange;

        // Curiosity:
        // - Boosted by high engagement and interaction bursts.
        // - Boosted by visual scanning (eye tracking proxy).
        // - Decays naturally.
        let curiosityChange = -0.8; // Natural decay
        
        if (input.interactionLevel > 0.7 && this.state.engagement > 0.6) {
             curiosityChange += 4; // Bursts of interaction
        }
        
        // Visual scanning (reading, looking around) indicates information seeking
        if (input.visualScanning > 0.2) {
            curiosityChange += input.visualScanning * 4;
        }

        this.state.curiosity = this.state.curiosity + curiosityChange;


        // Clamp all values between 0 and 100
        this.state.attention = Math.max(0, Math.min(100, this.state.attention));
        this.state.stress = Math.max(0, Math.min(100, this.state.stress));
        this.state.curiosity = Math.max(0, Math.min(100, this.state.curiosity));

        return {
            time: Date.now(),
            attention: this.state.attention,
            stress: this.state.stress,
            curiosity: this.state.curiosity,
        };
    }
}
