"use client";

import { useFactExtraction } from "@/components/fact-extraction/FactExtractionContext";
import { FactExtractionPanel } from "@/components/fact-extraction/FactExtractionPanel";
import { ScriptReviewPanel } from "@/components/generation/ScriptReviewPanel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWorkflowSession } from "@/hooks/useWorkflowSession";
import type { Fact } from "@/types";

function isFact(value: unknown): value is Fact {
  return (
    typeof value === "object" &&
    value !== null &&
    "concept" in value &&
    "details" in value &&
    "confidence" in value
  );
}

function getStepDescription(currentStep: string | null): string {
  switch (currentStep) {
    case "fact_extraction":
      return "Step 1: Extract facts from your learning materials";
    case "script_generation":
      return "Step 2: Generate script";
    case "image_selection":
      return "Step 3: Select images";
    case "completed":
      return "Completed";
    default:
      return "Step 1: Extract facts from your learning materials";
  }
}

export default function CreatePage() {
  const {
    extractedFacts,
    isExtracting,
    extractionError,
    confirmFacts,
    confirmedFacts,
  } = useFactExtraction();

  // Get workflow session for current step and session data
  const workflowSession = useWorkflowSession();
  const currentStep = workflowSession.currentStep;
  const session = workflowSession.session;

  const handleFactsChange = (_facts: typeof extractedFacts) => {
    // Facts are updated in context - no action needed here
  };

  const handleContinue = (facts: Fact[]) => {
    confirmFacts(facts);
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Create Educational Video</h1>
        <p className="text-muted-foreground text-sm">
          {getStepDescription(currentStep)}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {workflowSession.loading && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent" />
                <p className="text-muted-foreground">Loading session...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {workflowSession.error && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">{workflowSession.error}</p>
            </CardContent>
          </Card>
        )}

        {isExtracting && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent" />
                <p className="text-muted-foreground">
                  Analyzing your materials and extracting facts...
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {extractionError && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">{extractionError}</p>
            </CardContent>
          </Card>
        )}

        {/* Display panels based on current workflow step */}
        {currentStep === "fact_extraction" && (
          <>
            {extractedFacts.length > 0 && !confirmedFacts && (
              <FactExtractionPanel
                facts={extractedFacts}
                onFactsChange={handleFactsChange}
                onContinue={handleContinue}
              />
            )}

            {!isExtracting &&
              extractedFacts.length === 0 &&
              !extractionError &&
              !confirmedFacts && (
                <Card>
                  <CardHeader>
                    <CardTitle>Ready to Extract Facts</CardTitle>
                    <CardDescription>
                      Use the chat panel on the left to provide your learning
                      materials. You can:
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-muted-foreground list-disc space-y-2 pl-6">
                      <li>Paste text directly into the chat</li>
                      <li>Upload a PDF file</li>
                      <li>Provide a URL to educational content</li>
                    </ul>
                  </CardContent>
                </Card>
              )}
          </>
        )}

        {currentStep === "script_generation" && (
          <ScriptReviewPanel
            topic={session?.topic ?? "Educational Content"}
            script={session?.generatedScript}
            sessionId={workflowSession.sessionId}
          />
        )}

        {currentStep === "image_selection" && (
          <Card>
            <CardHeader>
              <CardTitle>Image Selection</CardTitle>
              <CardDescription>
                Select images for your video. This feature is coming soon.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {session?.assets && session.assets.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {session.assets.map((asset) => (
                    <div key={asset.id} className="rounded-lg border p-4">
                      <p className="text-muted-foreground text-sm">
                        {asset.assetType}
                      </p>
                      {asset.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.url}
                          alt={asset.assetType}
                          className="mt-2 rounded"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No images available yet. Images will appear here once
                  generated.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {currentStep === "completed" && (
          <Card>
            <CardHeader>
              <CardTitle>Workflow Completed</CardTitle>
              <CardDescription>
                Your educational video content is ready!
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
