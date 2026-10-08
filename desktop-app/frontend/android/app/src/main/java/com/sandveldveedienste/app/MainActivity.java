package com.sandveldveedienste.app;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PairingStorePlugin.class);
        super.onCreate(savedInstanceState);
        // Client details are on screen: keep them out of screenshots and the recent-apps thumbnail.
        // (Debug builds only skip it, so screenshots can be taken while testing; the release APK always has it.)
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!debuggable) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
        getBridge().setWebViewClient(new PinningWebViewClient(getBridge()));
    }
}
