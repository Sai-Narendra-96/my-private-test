type MicLease = {
  deviceKey: string;
  stream: MediaStream;
  refCount: number;
};

let activeLease: MicLease | null = null;
const borrowedStreams = new WeakMap<MediaStream, MicLease>();

const buildSharedConstraints = (deviceId: string): MediaTrackConstraints => ({
  ...(deviceId ? { deviceId: { ideal: deviceId } } : { deviceId: "default" }),
  channelCount: 1,
  echoCancellation: true,
  autoGainControl: true,
  noiseSuppression: true,
});

const stopStream = (stream: MediaStream) => {
  stream.getTracks().forEach((track) => track.stop());
};

const cleanupLeaseIfIdle = (lease: MicLease) => {
  if (lease.refCount > 0) {
    return;
  }

  stopStream(lease.stream);
  if (activeLease === lease) {
    activeLease = null;
  }
};

export async function acquireSharedMicrophone(
  deviceId: string = ""
): Promise<MediaStream> {
  const requestedDeviceKey = deviceId || "default";

  if (
    activeLease &&
    activeLease.deviceKey !== requestedDeviceKey &&
    activeLease.refCount === 0
  ) {
    stopStream(activeLease.stream);
    activeLease = null;
  }

  if (!activeLease) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: buildSharedConstraints(deviceId),
    });

    activeLease = {
      deviceKey: requestedDeviceKey,
      stream,
      refCount: 0,
    };

    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (activeLease?.stream === stream) {
          activeLease = null;
        }
      });
    });
  } else if (activeLease.deviceKey !== requestedDeviceKey) {
    // Avoid interrupting active consumers when the selected device changes
    // mid-stream. New device will be applied when current consumers release.
    console.warn(
      "Microphone device change deferred until active capture is released"
    );
  }

  activeLease.refCount += 1;
  const borrowedStream = activeLease.stream.clone();
  borrowedStreams.set(borrowedStream, activeLease);
  return borrowedStream;
}

export function releaseSharedMicrophone(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }

  stopStream(stream);

  const lease = borrowedStreams.get(stream);
  if (!lease) {
    return;
  }

  borrowedStreams.delete(stream);
  lease.refCount = Math.max(0, lease.refCount - 1);
  cleanupLeaseIfIdle(lease);
}
