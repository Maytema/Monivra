package app.monivra.finance;

import android.os.Bundle;
import android.view.View;
import android.os.SystemClock;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The splash stays until the web page has drawn its first screen, so there is no empty frame
    // between the two; it is taken away the moment the page says it is ready. The limit below is only
    // a safety net for a page that never answers, not a wait.
    private static final long SPLASH_LIMIT_MS = 4000;
    private volatile boolean webReady = false;

    // Called (through the plugin) when the page has drawn its first screen.
    public void markWebReady() {
        webReady = true;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        final long started = SystemClock.uptimeMillis();
        splash.setKeepOnScreenCondition(
            () -> !webReady && SystemClock.uptimeMillis() - started < SPLASH_LIMIT_MS);
        registerPlugin(MonivraNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Until the page paints, the web view shows the color of the screen, not white.
        getBridge().getWebView().setBackgroundColor(getColor(R.color.monivra_bg));

        // From Android 15 apps are drawn behind the system bars and the keyboard. The web page is not
        // drawn there: the content is given the room the bars and the keyboard leave, and what shows
        // behind the bars is painted in the color of the screen (see MonivraNativePlugin.setSystemBars).
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
