package com.sandveldveedienste.app;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PairingStorePlugin.class);
        super.onCreate(savedInstanceState);
        // Client details are on screen: keep them out of screenshots and the recent-apps thumbnail.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        getBridge().setWebViewClient(new PinningWebViewClient(getBridge()));
    }
}
