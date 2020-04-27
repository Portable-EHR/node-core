
class Placeholder {
    constructor(props) {
    }

    doIt(){}

    doItAgain(){
        return this.doIt() && this.doIt();
    }

}

class Place extends Placeholder {

    constructor(props) {
        super(props);

    }

}

module.exports.Place = Place;