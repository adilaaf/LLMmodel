# Front-End Interface for Multi-LLM Collaborative Agent

## Objective
Build a React front-end interface for an AI agent that integrates multiple LLM models, assigns them tasks based on their specialties, enables them to collaborate and share results, synthesizes a final insight, and incorporates human feedback to improve outputs.

Submit a problem or query

See multiple LLMs (with different specialties) take on assigned tasks

Watch the collaboration between models in real time

View a synthesized final insight

Give manual feedback to improve future results

## Requirements
1. **Task Input**: Allow the user to enter a question or request.
2. **Model Outputs**: Display results from multiple LLM models both before and after collaboration.
3. **Specialty Info**: Show each model’s specialty.
4. **Feedback**: Enable the user to submit feedback for each model’s output.
5. **Synthesized Insight**: Display the final synthesized answer from all models.
6. **API Integration**: Use backend endpoints for data retrieval and feedback submission.



## Mock Backend Endpoints
- **POST** `/api/run-agent`:
  - **Request**: `{ query: string }`
  - **Response**:
    ```json
    {
      "models": [
        { "name": "Model A", "specialty": "Math", "initial_output": "...", "final_output": "..." },
        { "name": "Model B", "specialty": "Science", "initial_output": "...", "final_output": "..." }
      ],
      "synthesized_insight": "Final combined answer"
    }
    ```

- **POST** `/api/feedback`:
  - **Request**: `{ model: string, feedback: string }`
  - **Response**: `{ "status": "ok" }`

## Evaluation Criteria
- **UI/UX**: Clean, responsive, and intuitive.
- **Code Quality**: Organized, readable, and reusable components.
- **Functionality**: Correctly fetches data, displays results, and submits feedback.
- **Collaboration Simulation**: Proper representation of multi-model interaction.

## Bonus
- Implement loading indicators and error handling.
- Store feedback history locally.
- Add visualization of collaboration flow between models.
- Show a timeline view of collaboration steps
- Add loading animations during LLM processing
- Maintain session history in the UI
- Let the user choose which models to use before running

---
This README defines the core exercise. Candidates can extend functionality, refine design, and optimize code for production readiness.
