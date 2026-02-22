import { fetchSTT } from "@/lib";
import { UseCompletionReturn } from "@/types";
import { useMicVAD } from "@ricky0123/vad-react";
import { LoaderCircleIcon, MicIcon, MicOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components";
import { useApp } from "@/contexts";
import { floatArrayToWav } from "@/lib/utils";
import { shouldUsePluelyAPI } from "@/lib/functions/pluely.api";

interface AutoSpeechVADProps {
  submit: UseCompletionReturn["submit"];
  setState: UseCompletionReturn["setState"];
  setEnableVAD: UseCompletionReturn["setEnableVAD"];
  setMicOpen: UseCompletionReturn["setMicOpen"];
  microphoneDeviceId: string;
}

interface AutoSpeechVADInternalProps {
  submit: UseCompletionReturn["submit"];
  setState: UseCompletionReturn["setState"];
  setEnableVAD: UseCompletionReturn["setEnableVAD"];
  setMicOpen: UseCompletionReturn["setMicOpen"];
  stream: MediaStream;
}

const AutoSpeechVADInternal = ({
  submit,
  setState,
  setEnableVAD,
  setMicOpen,
  stream,
}: AutoSpeechVADInternalProps) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { selectedSttProvider, allSttProviders } = useApp();

  const vad = useMicVAD({
    userSpeakingThreshold: 0.6,
    startOnLoad: true,
    stream,
    onSpeechEnd: async (audio) => {
      try {
        // convert float32array to blob
        const audioBlob = floatArrayToWav(audio, 16000, "wav");

        let transcription: string;
        const usePluelyAPI = await shouldUsePluelyAPI();

        // Check if we have a configured speech provider
        if (!selectedSttProvider.provider && !usePluelyAPI) {
          console.warn("No speech provider selected");
          setState((prev: any) => ({
            ...prev,
            error:
              "No speech provider selected. Please select one in settings.",
          }));
          return;
        }

        const providerConfig = allSttProviders.find(
          (p) => p.id === selectedSttProvider.provider
        );

        if (!providerConfig && !usePluelyAPI) {
          console.warn("Selected speech provider configuration not found");
          setState((prev: any) => ({
            ...prev,
            error:
              "Speech provider configuration not found. Please check your settings.",
          }));
          return;
        }

        setIsTranscribing(true);

        // Use the fetchSTT function for all providers
        transcription = await fetchSTT({
          provider: usePluelyAPI ? undefined : providerConfig,
          selectedProvider: selectedSttProvider,
          audio: audioBlob,
        });

        if (transcription) {
          submit(transcription);
        }
      } catch (error) {
        console.error("Failed to transcribe audio:", error);
        setState((prev: any) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Transcription failed",
        }));
      } finally {
        setIsTranscribing(false);
      }
    },
  });

  return (
    <>
      <Button
        size="icon"
        onClick={() => {
          if (vad.listening) {
            vad.pause();
            setEnableVAD(false);
            setMicOpen(false);
          } else {
            vad.start();
            setEnableVAD(true);
            setMicOpen(true);
          }
        }}
        className="cursor-pointer"
      >
        {isTranscribing ? (
          <LoaderCircleIcon className="h-4 w-4 animate-spin text-green-500" />
        ) : vad.userSpeaking ? (
          <LoaderCircleIcon className="h-4 w-4 animate-spin" />
        ) : vad.listening ? (
          <MicOffIcon className="h-4 w-4 animate-pulse" />
        ) : (
          <MicIcon className="h-4 w-4" />
        )}
      </Button>
    </>
  );
};

export const AutoSpeechVAD = ({
  submit,
  setState,
  setEnableVAD,
  setMicOpen,
  microphoneDeviceId,
}: AutoSpeechVADProps) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [initializing, setInitializing] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStream(null);

    // Prefer the selected mic but keep it non-strict (`ideal`) so browser/OS
    // can gracefully fall back to a shared/default device if needed.
    const audioConstraints: MediaTrackConstraints = microphoneDeviceId
      ? { deviceId: { ideal: microphoneDeviceId } }
      : { deviceId: "default" };

    const initStream = async () => {
      try {
        setInitializing(true);
        const acquiredStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });

        if (cancelled) {
          acquiredStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = acquiredStream;
        setStream(acquiredStream);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to access microphone";
        setState((prev: any) => ({
          ...prev,
          error: message,
        }));
        setEnableVAD(false);
        setMicOpen(false);
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    };

    initStream();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [microphoneDeviceId, setEnableVAD, setMicOpen, setState]);

  if (initializing || !stream) {
    return (
      <Button size="icon" className="cursor-wait" disabled>
        <LoaderCircleIcon className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  return (
    <AutoSpeechVADInternal
      submit={submit}
      setState={setState}
      setEnableVAD={setEnableVAD}
      setMicOpen={setMicOpen}
      stream={stream}
    />
  );
};
