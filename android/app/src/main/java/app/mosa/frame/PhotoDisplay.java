package app.mosa.frame;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.util.Set;

/** Two bounded image layers: the next photo fades over the previous photo, including its black bars. */
final class PhotoDisplay extends FrameLayout {
    static final long FADE_MS = 1000;
    private ImageView current, previous;
    private String currentId = "", previousId = "";
    private boolean currentCover;
    private long transitionGeneration;

    PhotoDisplay(Context context) {
        super(context);
        previous = layer(context); current = layer(context);
    }
    private ImageView layer(Context context) {
        ImageView view = new ImageView(context);
        view.setBackgroundColor(Color.BLACK);
        view.setAlpha(0f);
        addView(view, new FrameLayout.LayoutParams(-1, -1));
        return view;
    }
    String currentId() { return currentId; }
    boolean isShowing(String id, boolean cover) { return id.equals(currentId) && cover == currentCover; }
    void show(Bitmap bitmap, String id, boolean cover) {
        finishTransition();
        boolean fade = !currentId.isEmpty();
        ImageView spare = previous; previous = current; current = spare;
        previousId = currentId; currentId = id; currentCover = cover;
        current.setScaleType(cover ? ImageView.ScaleType.CENTER_CROP : ImageView.ScaleType.FIT_CENTER);
        current.setImageBitmap(bitmap);
        current.setAlpha(fade ? 0f : 1f);
        current.bringToFront();
        if (!fade) { previous.setImageDrawable(null); previous.setAlpha(0f); previousId = ""; return; }
        final long generation = transitionGeneration;
        current.animate().alpha(1f).setDuration(FADE_MS).setInterpolator(new AccelerateDecelerateInterpolator())
            .withEndAction(() -> { if (generation == transitionGeneration) finishTransition(); }).start();
    }
    void retain(Set<String> allowedIds) {
        // Privacy changes take precedence over animation, on both layers.
        if (!allowedIds.contains(currentId)) clear();
        else if (!previousId.isEmpty() && !allowedIds.contains(previousId)) finishTransition();
    }
    private void finishTransition() {
        ++transitionGeneration;
        current.animate().cancel(); current.setAlpha(1f);
        previous.setImageDrawable(null); previous.setAlpha(0f); previousId = "";
    }
    void clear() {
        finishTransition(); current.setImageDrawable(null); current.setAlpha(0f); currentId = "";
    }
    @Override protected void onDetachedFromWindow() { clear(); super.onDetachedFromWindow(); }
}
