interface ElectronWindowControls {
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
}

interface Window {
  electronWindow?: ElectronWindowControls;
  electronUpdates?: { check(): Promise<string> };
}
