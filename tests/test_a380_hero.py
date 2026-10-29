"""Hero 3D: animation, pause, direct manipulation, visibility and reduced motion."""
import sys
from playwright.sync_api import sync_playwright,expect
from test_a380_lab import server,ARTIFACTS


def main(base):
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1512,'height':1080},device_scale_factor=2)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/projets/a380-lab/',wait_until='domcontentloaded')
        expect(page.locator('.version')).to_have_text('v1.5.1')
        figure=page.locator('#aircraftShowcase');canvas=page.locator('#aircraftHeroCanvas');button=page.locator('#aircraftHeroPause')
        figure.scroll_into_view_if_needed()
        expect(figure).to_have_attribute('data-animation','running')
        page.wait_for_function('document.querySelector("#aircraftHeroCanvas").width>200')
        frame=canvas.evaluate('el=>el.toDataURL()');page.wait_for_timeout(500)
        assert frame!=canvas.evaluate('el=>el.toDataURL()'),'hero must animate'
        figure.screenshot(path=str(ARTIFACTS/'hero3d-autoplay.png'))
        button.click();expect(figure).to_have_attribute('data-animation','paused')
        page.wait_for_timeout(100);frame=canvas.evaluate('el=>el.toDataURL()');page.wait_for_timeout(300)
        assert frame==canvas.evaluate('el=>el.toDataURL()'),'paused hero must stop repainting'
        canvas.focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(100)
        assert frame!=canvas.evaluate('el=>el.toDataURL()'),'keyboard must rotate the model while paused'
        box=canvas.bounding_box();frame=canvas.evaluate('el=>el.toDataURL()')
        page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']/2+65,box['y']+box['height']/2+20,steps=6);page.mouse.up()
        assert frame!=canvas.evaluate('el=>el.toDataURL()'),'drag must rotate the model'
        page.keyboard.press('Home');page.wait_for_timeout(60)
        page.locator('.intro').screenshot(path=str(ARTIFACTS/'hero3d-desktop.png'))
        for _ in range(13):page.keyboard.press('ArrowLeft')
        for _ in range(4):page.keyboard.press('ArrowUp')
        page.wait_for_timeout(100);figure.screenshot(path=str(ARTIFACTS/'hero3d-engines-under-wings.png'))
        page.keyboard.press('Home')
        for width in [1240,900,390]:
            page.set_viewport_size({'width':width,'height':844})
            figure.scroll_into_view_if_needed();page.wait_for_timeout(120)
            expect(figure).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
            if width==390:page.locator('.intro').screenshot(path=str(ARTIFACTS/'hero3d-mobile.png'))
        page.set_viewport_size({'width':1512,'height':1080});figure.scroll_into_view_if_needed()
        button.click();expect(figure).to_have_attribute('data-animation','running')
        page.locator('.app-footer').scroll_into_view_if_needed();expect(figure).to_have_attribute('data-animation','offscreen')
        page.wait_for_timeout(100);frame=canvas.evaluate('el=>el.toDataURL()');page.wait_for_timeout(300)
        assert frame==canvas.evaluate('el=>el.toDataURL()'),'offscreen hero must stop drawing'
        figure.scroll_into_view_if_needed();expect(figure).to_have_attribute('data-animation','running')
        # The shared mesh still renders in the actual trajectory player.
        page.get_by_role('tab',name='Trajectoire 3D',exact=True).click()
        page.wait_for_function("!document.querySelector('#run').disabled && document.querySelector('#flightTimeline').max>100",timeout=180000)
        page.locator('#flightCanvas').scroll_into_view_if_needed();page.wait_for_timeout(100)
        assert page.locator('#flightCanvas').evaluate('el=>el.width>300')
        reduced=browser.new_context(viewport={'width':1100,'height':850},reduced_motion='reduce')
        rp=reduced.new_page();rp.on('pageerror',lambda e:errors.append(str(e)))
        rp.goto(base+'/projets/a380-lab/',wait_until='domcontentloaded')
        rf=rp.locator('#aircraftShowcase');rf.scroll_into_view_if_needed()
        expect(rf).to_have_attribute('data-animation','running')
        rc=rp.locator('#aircraftHeroCanvas');rp.wait_for_timeout(100)
        frame=rc.evaluate('el=>el.toDataURL()');rp.wait_for_timeout(350)
        assert frame!=rc.evaluate('el=>el.toDataURL()'),'hero must autoplay with gentle motion even when reduced motion is requested'
        rp.locator('#aircraftHeroPause').click();expect(rf).to_have_attribute('data-animation','paused')
        assert not errors,errors
        browser.close()
    print('Hero 3D animation, controls, desktop/mobile, offscreen pause, reduced motion and shared trajectory mesh: PASS',flush=True)


if __name__=='__main__':
    if len(sys.argv)>1:main(sys.argv[1].rstrip('/'))
    else:
        with server() as base:main(base)
