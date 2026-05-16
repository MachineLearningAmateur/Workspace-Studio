import type { CodeVisualizationResponse } from "../types/tracker";

interface CodeVisualizerModalProps {
  state: {
    title: string;
    isLoading: boolean;
    error: string | null;
    visualization: CodeVisualizationResponse | null;
  } | null;
  currentStepIndex: number;
  onClose: () => void;
  onStepChange: (nextStepIndex: number) => void;
}

export function CodeVisualizerModal({ state, currentStepIndex, onClose, onStepChange }: CodeVisualizerModalProps) {
  if (!state) {
    return null;
  }

  const steps = state.visualization?.steps ?? [];
  const step = steps[currentStepIndex] ?? null;
  const codeLines = state.visualization?.code.split(/\r?\n/) ?? [];
  const assumptions = state.visualization?.assumptions ?? [];

  return (
    <section className="visualizer-chatbox" aria-label="Code visualizer">
      <div className="visualizer-chatbox-header">
        <div>
          <p className="eyebrow">Code Visualizer</p>
          <h2 id="visualizer-title">{state.title}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onClose} aria-label="Close code visualizer">
          Close
        </button>
      </div>

      {state.isLoading ? <p className="loading-state">Generating step trace...</p> : null}
      {!state.isLoading && state.error ? <section className="alert" role="alert">{state.error}</section> : null}

      {!state.isLoading && !state.error && state.visualization ? (
        <div className="visualizer-layout">
          <section className="visualizer-panel">
            <div className="section-heading compact-heading">
              <div>
                <h3>Execution</h3>
                <p>{state.visualization.summary || "Step through the snippet line by line."}</p>
              </div>
              <div className="visualizer-controls">
                <button type="button" disabled={currentStepIndex <= 0} onClick={() => onStepChange(currentStepIndex - 1)}>
                  Prev
                </button>
                <span className="visualizer-step-label">
                  Step {steps.length === 0 ? 0 : currentStepIndex + 1} of {steps.length}
                </span>
                <button
                  type="button"
                  disabled={currentStepIndex >= steps.length - 1}
                  onClick={() => onStepChange(currentStepIndex + 1)}
                >
                  Next
                </button>
              </div>
            </div>

            <div className="visualizer-code">
              {codeLines.map((line, index) => (
                <div className={`visualizer-code-line ${step?.lineNumber === index + 1 ? "active-line" : ""}`} key={`${index + 1}-${line}`}>
                  <span>{index + 1}</span>
                  <code>{line || " "}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="visualizer-panel">
            <div className="section-heading compact-heading">
              <div>
                <h3>State</h3>
                <p>
                  {step ? `Line ${step.lineNumber}: ${step.lineText || "No line text available"}` : "No current step selected."}
                </p>
              </div>
            </div>

            {step ? (
              <div className="visualizer-state">
                {assumptions.length ? (
                  <div className="visualizer-assumptions">
                    <strong>Assumptions From Context</strong>
                    <ul>
                      {assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="visualizer-step-explanation">
                  <strong>Explanation</strong>
                  <p>{step.explanation || "No explanation provided."}</p>
                </div>

                {step.output ? (
                  <div className="visualizer-step-output">
                    <strong>Output</strong>
                    <pre>{step.output}</pre>
                  </div>
                ) : null}

                <div className="visualizer-variables">
                  <strong>Variables</strong>
                  {Object.keys(step.variables).length ? (
                    <dl>
                      {Object.entries(step.variables).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>No variables recorded for this step.</p>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
