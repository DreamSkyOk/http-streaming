import { isIncompatible, isEnabled, isAudioOnly } from './playlist.js';
import { codecsForPlaylist } from './util/codecs.js';

/**
 * Returns a function that acts as the Enable/disable playlist function.
 *
 * @param {PlaylistLoader} loader - The main playlist loader
 * @param {string} playlistID - id of the playlist
 * @param {Function} changePlaylistFn - A function to be called after a
 * playlist's enabled-state has been changed. Will NOT be called if a
 * playlist's enabled-state is unchanged
 * @param {boolean=} enable - Value to set the playlist enabled-state to
 * or if undefined returns the current enabled-state for the playlist
 * @return {Function} Function for setting/getting enabled
 */
const enableFunction = (loader, playlistID, changePlaylistFn) => (enable) => {
  const playlist = loader.main.playlists[playlistID];
  const incompatible = isIncompatible(playlist);
  const currentlyEnabled = isEnabled(playlist);

  if (typeof enable === 'undefined') {
    return currentlyEnabled;
  }

  if (enable) {
    delete playlist.disabled;
  } else {
    playlist.disabled = true;
  }
  const metadata = {
    renditionInfo: {
      id: playlistID,
      bandwidth: playlist.attributes.BANDWIDTH,
      resolution: playlist.attributes.RESOLUTION,
      codecs: playlist.attributes.CODECS
    },
    cause: 'fast-quality'
  };

  if (enable !== currentlyEnabled && !incompatible) {
    // Ensure the outside world knows about our changes
    if (enable) {
      // call fast quality change only when the playlist is enabled
      changePlaylistFn(playlist);
      loader.trigger({ type: 'renditionenabled', metadata});
    } else {
      loader.trigger({ type: 'renditiondisabled', metadata});
    }
  }
  return enable;
};

/**
 * The representation object encapsulates the publicly visible information
 * in a media playlist along with a setter/getter-type function (enabled)
 * for changing the enabled-state of a particular playlist entry
 *
 * @class Representation
 */
class Representation {
  constructor(vhsHandler, playlist, id) {
    const {
      playlistController_: pc
    } = vhsHandler;
    const qualityChangeFunction = pc.fastQualityChange_.bind(pc);

    // some playlist attributes are optional
    if (playlist.attributes) {
      const resolution = playlist.attributes.RESOLUTION;

      this.width = resolution && resolution.width;
      this.height = resolution && resolution.height;

      this.bandwidth = playlist.attributes.BANDWIDTH;
      this.frameRate = playlist.attributes['FRAME-RATE'];
    }

    this.codecs = codecsForPlaylist(pc.main(), playlist);

    this.playlist = playlist;

    // The id is simply the ordinality of the media playlist
    // within the main playlist
    this.id = id;

    // Partially-apply the enableFunction to create a playlist-
    // specific variant
    this.enabled = enableFunction(
      vhsHandler.playlists,
      playlist.id,
      qualityChangeFunction
    );
  }
}

/**
 * A mixin function that adds the `representations` api to an instance
 * of the VhsHandler class
 *
 * @param {VhsHandler} vhsHandler - An instance of VhsHandler to add the
 * representation API into
 */
const renditionSelectionMixin = function(vhsHandler) {

  // Add a single API-specific function to the VhsHandler instance
  vhsHandler.representations = () => {
    const main = vhsHandler.playlistController_.main();
    const playlists = isAudioOnly(main) ?
      vhsHandler.playlistController_.getAudioTrackPlaylists_() :
      main.playlists;

    if (!playlists) {
      return [];
    }
    return playlists
      .filter((media) => !isIncompatible(media))
      .map((e, i) => new Representation(vhsHandler, e, e.id));
  };
};

export default renditionSelectionMixin;
